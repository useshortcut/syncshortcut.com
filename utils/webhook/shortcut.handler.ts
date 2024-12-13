import { GENERAL, GITHUB, SHORTCUT, SHARED } from "../constants";
import { ShortcutWebhookPayload, MilestoneState, ShortcutStory, ShortcutEpic, ShortcutIteration } from "../../typings/shortcut";
import { Platform } from "../../typings/platform";
import prisma from "../../prisma";
import {
    decrypt,
    getSyncFooter,
    isNumber,
    skipReason
} from "../index";
import {
    applyLabel,
    createComment,
    createLabel,
    prepareMarkdownContent,
    replaceMentions,
    upsertUser
} from "../../pages/api/utils";
import got from "got";
import { components } from "@octokit/openapi-types";
import { createMilestone, getGithubFooterWithShortcutCommentId, setIssueMilestone, inviteMember } from "../github";
import { ApiError, getStoryUpdateError } from "../errors";
import { shortcutQuery, getAttachmentQuery } from "../api/shortcut-query";

const SHORTCUT_IP_ORIGINS = [
    "35.231.147.226",
    "35.231.147.227",
    "35.231.147.228",
    "35.231.147.229",
    "35.231.147.230",
    "35.231.147.231"
];

export async function shortcutWebhookHandler(
    body: ShortcutWebhookPayload,
    originIp?: string
): Promise<string> {
    if (!SHORTCUT_IP_ORIGINS.includes(`${originIp || ""}`)) {
        throw new Error(
            `Could not verify Shortcut webhook from ${originIp || ""}`
        );
    }

    const {
        action,
        changes,
        primary_id,
        member_id,
        model,
        references
    } = body;

    const syncs = await prisma.sync.findMany({
        include: {
            LinearTeam: true,
            GitHubRepo: true
        }
    });

    const sync = syncs.find(s => {
        const isTeamMatching = references.some(ref => ref.entity_type === 'team' && s.shortcutTeamId === ref.id);
        const isUserMatching = s.shortcutUserId === member_id;

        return isUserMatching && isTeamMatching;
    });

    if (syncs.length === 0 || !sync) {
        const reason = `Shortcut user ${member_id || ""} not found in syncs.`;
        console.log(reason);
        return reason;
    }

    if (!sync?.LinearTeam || !sync?.GitHubRepo) {
        const reason = `Repo not found for ${references.find(ref => ref.entity_type === 'team')?.id || ""}`;
        console.log(reason);
        throw new ApiError(reason, 404);
    }

    const {
        githubApiKey,
        githubApiKeyIV,
        GitHubRepo: { repoName: repoFullName, repoId }
    } = sync;

    const shortcutKey = process.env.SHORTCUT_API_KEY;

    // Get story data either directly or from references
    const storyId = model === 'story' ? primary_id : references?.find(ref => ref.entity_type === 'story')?.id;
    const story = await shortcutQuery(`/stories/${storyId}`, shortcutKey);

    if (!story || story.error) {
        const reason = `Could not find Shortcut story ${storyId}`;
        console.log(reason);
        throw new ApiError(reason, 404);
    }

    const storyName = `${story.epic?.abbreviation ?? "SC"}-${story.id}`;

    const githubKey = process.env.GITHUB_API_KEY
        ? process.env.GITHUB_API_KEY
        : decrypt(githubApiKey, githubApiKeyIV);

    const githubAuthHeader = `Bearer ${githubKey}`;
    const userAgentHeader = GITHUB.TOKEN_NOTE;

    const defaultHeaders = {
        Authorization: githubAuthHeader,
        "User-Agent": userAgentHeader,
        Accept: "application/vnd.github+json"
    };

    // Map the user's Shortcut username to their GitHub username if not yet mapped
    await upsertUser(
        shortcutKey,
        member_id,
        story.owner_ids?.[0] || "",
        userAgentHeader,
        githubAuthHeader
    );

    const syncedStory = await prisma.syncedStory.findFirst({
        where: {
            shortcutStoryId: storyId.toString(),
            shortcutEpicId: story.epic_id?.toString(),
            shortcutTeamId: story.team_id
        },
        include: { GitHubRepo: true }
    });

    if (action === "update") {
        // Handle label changes
        if (changes?.labels) {
            const oldLabels = changes.labels.old || [];
            const newLabels = changes.labels.new || [];

            // Handle removed labels
            for (const oldLabel of oldLabels) {
                if (!newLabels.find(l => l.id === oldLabel.id)) {
                    const removedLabelResponse = await got.delete(
                        `${GITHUB.REPO_ENDPOINT}/${syncedStory.GitHubRepo.repoName}/issues/${syncedStory.githubIssueNumber}/labels/${oldLabel.name}`,
                        { headers: defaultHeaders }
                    );

                    if (removedLabelResponse.statusCode > 201) {
                        const reason = `Failed to remove label "${oldLabel.name}" from ${syncedStory.githubIssueId}.`;
                        console.log(reason);
                        throw new ApiError(reason, 403);
                    } else {
                        console.log(
                            `Removed label "${oldLabel.name}" from ${syncedStory.githubIssueId}.`
                        );
                    }
                }
            }

            // Handle added labels
            for (const newLabel of newLabels) {
                if (!oldLabels.find(l => l.id === newLabel.id)) {
                    // Create label with color
                    const labelColor = newLabel.color.replace('#', '');
                    const labelResponse = await createLabel(
                        syncedStory.GitHubRepo.repoName,
                        newLabel.name,
                        labelColor,
                        githubAuthHeader,
                        userAgentHeader
                    );

                    if (labelResponse.error) {
                        console.log(
                            `Could not create label "${newLabel.name}" in ${syncedStory.GitHubRepo.repoName}.`
                        );
                        continue;
                    }

                    const labelName = labelResponse.label ? labelResponse.label.name : newLabel.name;

                    const { error: applyLabelError } = await applyLabel({
                        repoFullName: syncedStory.GitHubRepo.repoName,
                        issueNumber: syncedStory.githubIssueNumber,
                        labelNames: [labelName],
                        githubAuthHeader,
                        userAgentHeader
                    });

                    if (applyLabelError) {
                        console.log(
                            `Could not apply label "${labelName}" to ${syncedIssue.githubIssueId}.`
                        );
                    } else {
                        console.log(
                            `Applied label "${labelName}" to ${syncedIssue.githubIssueId}.`
                        );
                    }
                }
            }
        }
    }

    const assignee = await prisma.user.findFirst({
        where: { shortcutUserId: story.owner_ids?.[0] },
        select: { githubUsername: true }
    });

            const createdIssueResponse = await got.post(
                `${GITHUB.REPO_ENDPOINT}/${repoFullName}/issues`,
                {
                    headers: defaultHeaders,
                    json: {
                        title: `[${storyName}] ${story.name}`,
                        body: modifiedDescription,
                        ...(assignee?.githubUsername && {
                            assignee: assignee.githubUsername
                        })
                    }
                }
            );

            if (
                !syncs.some(
                    s => s.shortcutUserId === story.owner_ids?.[0]
                )
            ) {
                await inviteMember(
                    story.owner_ids?.[0],
                    story.team_id,
                    repoFullName,
                    SHORTCUT
                );
            }

            if (createdIssueResponse.statusCode > 201) {
                const reason = `Failed to create issue for ${story.id} with status ${createdIssueResponse.statusCode}.`;
                console.log(reason);
                throw new ApiError(reason, 500);
            }

            const createdIssueData: components["schemas"]["issue"] = JSON.parse(
                createdIssueResponse.body
            );

            const attachmentUrl = `${GITHUB.BASE_URL}/${repoFullName}/issues/${createdIssueData.number}`;
            await shortcutQuery(`/stories/${story.id}/comments`, shortcutKey, "POST", JSON.stringify({
                text: `Created GitHub issue: ${attachmentUrl}`,
                external_id: createdIssueData.id
            }));

            await prisma.syncedIssue.create({
                data: {
                    githubIssueId: createdIssueData.id,
                    shortcutStoryId: story.id,
                    shortcutTeamId: story.group_id,
                    githubIssueNumber: createdIssueData.number,
                    shortcutStoryNumber: story.number,
                    githubRepoId: repoId
                }
            });

            // Apply all labels to newly-created issue
            let labelNames: string[] = [];
            const labelIds = story.labels?.map(label => label.id) || [];
            for (const labelId of labelIds) {
                const label = await shortcutQuery(`/labels/${labelId}`, shortcutKey);
                if (!label) {
                    console.log(`Could not find label ${labelId}`);
                    continue;
                }

                const { createdLabel, error } = await createLabel({
                    repoFullName,
                    label,
                    githubAuthHeader,
                    userAgentHeader
                });

                if (error) {
                    console.log(
                        `Failed to create GH label "${label.name}" in ${repoFullName}.`
                    );
                    continue;
                }

                const labelName = createdLabel ? createdLabel.name : label.name;

                labelNames.push(labelName);
            }

            // Add priority label if applicable
            if (!!story.priority && SHARED.PRIORITY_LABELS[story.priority]) {
                const priorityLabel = SHARED.PRIORITY_LABELS[story.priority];
                const { createdLabel, error } = await createLabel({
                    repoFullName,
                    label: priorityLabel,
                    githubAuthHeader,
                    userAgentHeader
                });

                if (error) {
                    console.log(
                        `Failed to create priority label "${priorityLabel.name}" in ${repoFullName}.`
                    );
                } else {
                    const labelName = createdLabel
                        ? createdLabel.name
                        : priorityLabel.name;

                    labelNames.push(labelName);
                }
            }

            const { error: applyLabelError } = await applyLabel({
                repoFullName,
                issueNumber: BigInt(story.number),
                labelNames,
                githubAuthHeader,
                userAgentHeader
            });

            if (applyLabelError) {
                console.log(
                    `Failed to apply labels to ${story.id} in ${repoFullName}.`
                );
            } else {
                console.log(
                    `Applied labels to ${story.id} in ${repoFullName}.`
                );
            }

            // Sync all comments on the issue
            const shortcutComments = await shortcutQuery(`/stories/${story.id}/comments`, shortcutKey).then(comments =>
                Promise.all(
                    comments.map(comment =>
                        Promise.resolve({
                            comment,
                            user: comment.author
                        })
                    )
                )
            );

            for (const shortcutComment of shortcutComments) {
                if (!shortcutComment) continue;

                const { comment, user } = shortcutComment;

                const modifiedComment = await replaceMentions(
                    comment.body,
                    "shortcut" as Platform
                );
                const footer = getGithubFooterWithShortcutCommentId(
                    user.displayName,
                    comment.id
                );

                const { error: commentError } = await createComment({
                    repoFullName,
                    issueNumber: BigInt(story.number),
                    body: `${modifiedComment || ""}${footer}`,
                    githubAuthHeader,
                    userAgentHeader
                });

                if (commentError) {
                    console.log(
                        `Failed to add comment to ${story.id} for ${storyName}.`
                    );
                } else {
                    console.log(
                        `Created comment on ${story.id} for ${storyName}.`
                    );
                }
            }
        }

        // Ensure there is a synced issue to update
        if (!syncedIssue) {
            const reason = skipReason("edit", storyName);
            console.log(reason);
            return reason;
        }

        // Title change
        if (changes?.title?.new && model === "story") {
            const shortcutKey = process.env.SHORTCUT_API_KEY;
            const story = await shortcutQuery(`/stories/${primary_id}`, shortcutKey);
            if (!story || story.error) {
                const reason = `Could not find story ${primary_id}`;
                console.log(reason);
                throw new ApiError(reason, 404);
            }

            const updatedIssueResponse = await got.patch(
                `${GITHUB.REPO_ENDPOINT}/${syncedIssue.GitHubRepo.repoName}/issues/${syncedIssue.githubIssueNumber}`,
                {
                    headers: defaultHeaders,
                    json: {
                        title: `[${storyName}] ${story.name}`
                    }
                }
            );

            if (updatedIssueResponse.statusCode > 201) {
                console.log(
                    getIssueUpdateError(
                        "title",
                        story,
                        syncedIssue,
                        updatedIssueResponse
                    )
                );
            } else {
                console.log(
                    `Updated GH issue title for ${story.id} on ${syncedIssue.githubIssueId}`
                );
            }
        }

        // Description change
        if (changes?.description?.new && model === "story") {
            const story = await shortcutQuery(`/stories/${primary_id}`, shortcutKey);
            if (!story || story.error) {
                const reason = `Could not find story ${primary_id}`;
                console.log(reason);
                throw new ApiError(reason, 404);
            }

            let markdown = story.description;

            const modifiedDescription = await prepareMarkdownContent(
                markdown || "",
                "shortcut" as Platform
            );

            const updatedIssueResponse = await got.patch(
                `${GITHUB.REPO_ENDPOINT}/${syncedIssue.GitHubRepo.repoName}/issues/${syncedIssue.githubIssueNumber}`,
                {
                    headers: defaultHeaders,
                    json: {
                        body: `${modifiedDescription}\n\n<sub>${getSyncFooter()} | [${storyName}](${SHORTCUT.STORY_URL}/${story.id})</sub>`
                    }
                }
            );

            if (updatedIssueResponse.statusCode > 201) {
                console.log(
                    getIssueUpdateError(
                        "description",
                        story,
                        syncedIssue,
                        updatedIssueResponse
                    )
                );
            } else {
                console.log(
                    `Updated GH issue desc for ${data.id} on ${syncedIssue.githubIssueId}`
                );
            }
        }

        // Epic or Iteration change
        if (
            ("iterationId" in updatedFrom || "epicId" in updatedFrom) &&
            actionType === "Story"
        ) {
            if (!syncedIssue) {
                const reason = skipReason("milestone", storyName);
                console.log(reason);
                return reason;
            }

            const isIteration = "iterationId" in updatedFrom;
            const resourceId = isIteration ? data.iterationId : data.epicId;

            if (!resourceId) {
                // Remove milestone
                const response = await setIssueMilestone(
                    githubKey,
                    syncedIssue.GitHubRepo.repoName,
                    syncedIssue.githubIssueNumber,
                    null
                );

                if (response.status > 201) {
                    const reason = `Failed to remove milestone for ${syncedIssue.githubIssueId} to ${storyName}.`;
                    console.log(reason);
                    throw new ApiError(reason, 500);
                } else {
                    const reason = `Removed milestone for ${storyName}.`;
                    console.log(reason);
                    return reason;
                }
            }

            let syncedMilestone = await prisma.milestone.findFirst({
                where: {
                    iterationId: resourceId,
                    shortcutTeamId: teamId
                }
            });

            if (!syncedMilestone) {
                const resource = await shortcut[isIteration ? "iteration" : "epic"](
                    resourceId
                );

                if (!resource) {
                    const reason = `Could not find epic/iteration ${resourceId} for ${storyName}.`;
                    console.log(reason);
                    throw new ApiError(reason, 500);
                }

                // Skip if epic/iteration was created by bot but not yet synced
                if (resource.description?.includes(getSyncFooter())) {
                    const reason = `Skipping epic/iteration "${resource.name}" for ${storyName}: caused by sync`;
                    console.log(reason);
                    return reason;
                }

                const title = isIteration
                    ? !resource.name
                        ? `v.${(resource as ShortcutIteration).number}`
                        : isNumber(resource.name)
                        ? `v.${resource.name}`
                        : resource.name
                    : resource.name || "?";

                const today = new Date();

                const endDate = (resource as ShortcutIteration).endsAt
                    ? new Date((resource as ShortcutIteration).endsAt)
                    : (resource as ShortcutEpic).targetDate
                    ? new Date((resource as ShortcutEpic).targetDate)
                    : null;

                const state: MilestoneState =
                    endDate > today ? "open" : "closed";

                const createdMilestone = await createMilestone(
                    githubKey,
                    syncedIssue.GitHubRepo.repoName,
                    title,
                    `${resource.description}${
                        isIteration ? "" : " (Epic)"
                    }\n\n> ${getSyncFooter()}`,
                    state,
                    endDate?.toISOString()
                );

                if (createdMilestone?.alreadyExists) {
                    console.log("Milestone already exists.");
                } else if (!createdMilestone?.milestoneId) {
                    const reason = `Failed to create milestone for ${syncedIssue.githubIssueId} to ${storyName}.`;
                    console.log(reason);
                    throw new ApiError(reason, 500);
                }

                syncedMilestone = await prisma.milestone.create({
                    data: {
                        milestoneId: createdMilestone.milestoneId,
                        iterationId: resourceId,
                        shortcutTeamId: story.team_id,
                        githubRepoId: syncedStory.githubRepoId
                    }
                });

            const response = await setIssueMilestone(
                process.env.GITHUB_API_KEY || '',
                syncedStory.GitHubRepo.repoName,
                syncedStory.githubIssueNumber,
                syncedMilestone.milestoneId
            );

            if (response.status > 201) {
                const reason = `Failed to add milestone for ${syncedIssue.githubIssueId} to ${storyName}.`;
                console.log(reason);
                throw new ApiError(reason, 500);
            } else {
                const reason = `Added milestone to ${syncedIssue.githubIssueId} for ${storyName}.`;
                console.log(reason);
                return reason;
            }
        }

        // State change (eg. "Started" to "Done")
        if (changes?.workflow_state_id) {
            const workflowState = await shortcutQuery(
                `/workflow-states/${changes.workflow_state_id.new}`,
                shortcutKey
            );

            const state = workflowState.name === SHORTCUT.STORY_STATES.done ||
                         workflowState.name === SHORTCUT.STORY_STATES.archived
                ? "closed"
                : "open";

            const reason = workflowState.name === SHORTCUT.STORY_STATES.archived
                ? "not_planned"
                : "completed";

            const updatedIssueResponse = await got.patch(
                `${GITHUB.REPO_ENDPOINT}/${syncedIssue.GitHubRepo.repoName}/issues/${syncedIssue.githubIssueNumber}`,
                {
                    headers: defaultHeaders,
                    json: {
                        state,
                        state_reason: reason
                    }
                }
            );

            if (updatedIssueResponse.statusCode > 201) {
                console.log(
                    getIssueUpdateError(
                        "state",
                        story,
                        syncedIssue,
                        updatedIssueResponse
                    )
                );
            } else {
                console.log(
                    `Updated GH issue state for ${story.id} on ${syncedIssue.githubIssueId}`
                );
            }
        }

        // Assignee change
        if (changes?.owner_ids) {
            // Remove all assignees before re-assigning to avoid false re-assignment events
            const issueEndpoint = `${GITHUB.REPO_ENDPOINT}/${syncedIssue.GitHubRepo.repoName}/issues/${syncedIssue.githubIssueNumber}`;

            const issueResponse = await got.get(issueEndpoint, {
                headers: defaultHeaders,
                responseType: "json"
            });

            const prevAssignees = (
                (await issueResponse.body) as Issue
            ).assignees?.map((assignee: User) => assignee?.login);

            // Set new assignee
            const newAssignee = changes.owner_ids.new?.[0]
                ? await prisma.user.findFirst({
                      where: {
                          shortcutUserId: changes.owner_ids.new[0]
                      },
                      select: {
                          githubUsername: true
                      }
                  })
                : null;

            if (data?.assigneeId && !newAssignee?.githubUsername) {
                console.log(
                    `Skipping assign for ${storyName}: no GH user was found for Shortcut user ${data.assigneeId}.`
                );
            } else if (prevAssignees?.includes(newAssignee?.githubUsername)) {
                console.log(
                    `Skipping assign for ${storyName}: Shortcut user ${data.assigneeId} is already assigned.`
                );
            } else {
                const assigneeEndpoint = `${GITHUB.REPO_ENDPOINT}/${syncedIssue.GitHubRepo.repoName}/issues/${syncedIssue.githubIssueNumber}/assignees`;

                const response = await got.post(assigneeEndpoint, {
                    headers: defaultHeaders,
                    json: {
                        assignees: [newAssignee?.githubUsername]
                    }
                });

                if (response.statusCode > 201) {
                    console.log(
                        getIssueUpdateError(
                            "assignee",
                            data,
                            syncedIssue,
                            response
                        )
                    );
                } else {
                    console.log(
                        `Added assignee to ${syncedIssue.githubIssueId} for ${storyName}.`
                    );
                }

                // Remove old assignees on GitHub
                const unassignResponse = await got.delete(assigneeEndpoint, {
                    headers: defaultHeaders,
                    json: {
                        assignees: [prevAssignees]
                    }
                });

                if (unassignResponse.statusCode > 201) {
                    console.log(
                        getIssueUpdateError(
                            "assignee",
                            data,
                            syncedIssue,
                            unassignResponse
                        )
                    );
                } else {
                    console.log(
                        `Removed assignee from ${syncedIssue.githubIssueId} for ${storyName}.`
                    );
                }
            }
        }

        if ("priority" in updatedFrom) {
            const priorityLabels = SHARED.PRIORITY_LABELS;

            if (
                !priorityLabels[data.priority] ||
                !priorityLabels[updatedFrom.priority]
            ) {
                throw new ApiError(
                    `Could not find a priority label for ${updatedFrom.priority} or ${data.priority}.`,
                    403
                );
            }

            const prevPriorityLabel = priorityLabels[updatedFrom.priority];

            // Remove old priority label
            try {
                const removedLabelResponse = await got.delete(
                    `${GITHUB.REPO_ENDPOINT}/${syncedIssue.GitHubRepo.repoName}/issues/${syncedIssue.githubIssueNumber}/labels/${prevPriorityLabel.name}`,
                    { headers: defaultHeaders }
                );

                if (removedLabelResponse.statusCode > 201) {
                    console.log(
                        `Failed to remove priority label "${prevPriorityLabel.name}" from ${syncedIssue.githubIssueId}.`
                    );
                } else {
                    console.log(
                        `Removed priority "${prevPriorityLabel.name}" from ${syncedIssue.githubIssueId}.`
                    );
                }
            } catch (e) {
                console.log(
                    `Failed to remove previous priority label from ${syncedIssue.githubIssueId}.`
                );
            }

            if (data.priority === 0) {
                return `Removed priority label "${prevPriorityLabel.name}" from ${syncedIssue.githubIssueId}.`;
            }

            // Add new priority label if not none
            const priorityLabel = priorityLabels[data.priority];
            const { createdLabel, error } = await createLabel({
                repoFullName,
                label: priorityLabel,
                githubAuthHeader,
                userAgentHeader
            });

            if (error) {
                throw new ApiError("Could not create label.", 403);
            }

            const labelName = createdLabel
                ? createdLabel.name
                : priorityLabel.name;

            const { error: applyLabelError } = await applyLabel({
                repoFullName: syncedIssue.GitHubRepo.repoName,
                issueNumber: syncedIssue.githubIssueNumber,
                labelNames: [labelName],
                githubAuthHeader,
                userAgentHeader
            });

            if (applyLabelError) {
                throw new ApiError(
                    `Failed to apply priority label "${labelName}" to ${syncedIssue.githubIssueId}.`,
                    403
                );
            } else {
                return `Applied priority label "${labelName}" to ${syncedIssue.githubIssueId}.`;
            }
        }

        if ("estimate" in updatedFrom) {
            // Remove old estimate label
            const prevLabelName = `${updatedFrom.estimate} points`;

            const removedLabelResponse = await got.delete(
                `${GITHUB.REPO_ENDPOINT}/${syncedIssue.GitHubRepo.repoName}/issues/${syncedIssue.githubIssueNumber}/labels/${prevLabelName}`,
                {
                    headers: defaultHeaders,
                    throwHttpErrors: false
                }
            );

            if (removedLabelResponse.statusCode > 201) {
                console.log(
                    `Failed to remove estimate label "${prevLabelName}" from ${syncedIssue.githubIssueId}.`
                );
            } else {
                console.log(
                    `Removed estimate "${prevLabelName}" from ${syncedIssue.githubIssueId}.`
                );
            }

            if (!data.estimate) {
                return `Removed estimate label "${prevLabelName}" from ${syncedIssue.githubIssueId}.`;
            }

            // Create new estimate label if not yet existent
            const estimateLabel = {
                name: `${data.estimate} points`,
                color: "666"
            };

            const { createdLabel, error } = await createLabel({
                repoFullName,
                label: estimateLabel,
                githubAuthHeader,
                userAgentHeader
            });

            if (error) {
                const reason = `Could not create estimate label "${estimateLabel.name}" for ${syncedIssue.githubIssueId}.`;
                console.log(reason);
                throw new ApiError(reason, 403);
            }

            const labelName = createdLabel
                ? createdLabel.name
                : estimateLabel.name;

            const { error: applyLabelError } = await applyLabel({
                repoFullName,
                issueNumber: Number(syncedIssue?.githubIssueNumber),
                labelNames: [labelName],
                githubAuthHeader,
                userAgentHeader
            });

            if (applyLabelError) {
                const reason = `Could not apply estimate label "${labelName}" to ${syncedIssue.githubIssueId}.`;
                console.log(reason);
                throw new ApiError(reason, 403);
            } else {
                console.log(
                    `Applied estimate label "${labelName}" to issue #${syncedIssue.githubIssueNumber}.`
                );
            }
        }
    } else if (action === "create") {
        if (model === "comment") {
            // Comment added
            if (!syncedIssue) {
                console.log(skipReason("comment", storyName));
                return skipReason("comment", storyName);
            }

            const comment = await shortcutQuery(`/comments/${primary_id}`, shortcutKey);
            if (!comment || comment.error) {
                const reason = `Could not find comment ${primary_id}`;
                console.log(reason);
                throw new ApiError(reason, 404);
            }

            let modifiedBody = await replaceMentions(comment.text, "shortcut");

            // Get the comment author
            const author = await shortcutQuery(`/members/${comment.author_id}`, shortcutKey);
            const footer = getGithubFooterWithShortcutCommentId(
                author.name || "Unknown User",
                comment.id.toString()
            );

            const { error: commentError } = await createComment({
                repoFullName: syncedIssue.GitHubRepo.repoName,
                issueNumber: syncedIssue.githubIssueNumber,
                body: `${modifiedBody || ""}${footer}`,
                githubAuthHeader: defaultHeaders.Authorization,
                userAgentHeader: defaultHeaders["User-Agent"]
            });

            if (commentError) {
                console.log(
                    `Failed to create comment for ${story.id} on ${syncedIssue.githubIssueId}.`
                );
            } else {
                console.log(
                    `Synced comment for ${syncedIssue.githubIssueId}.`
                );
            }
        } else if (model === "story") {
            // Story created
            if (!story.labels?.some(label => label.name === SHORTCUT.GITHUB_LABEL)) {
                const reason = "Story is not labeled for GitHub sync";
                console.log(reason);
                return reason;
            }

            if (syncedIssue) {
                const reason = `Skipping story create: ${story.id} exists as ${syncedIssue.githubIssueId}`;
                console.log(reason);
                return reason;
            }

            let modifiedDescription = await prepareMarkdownContent(
                story.description || "",
                "shortcut" as Platform
            );

            const assignee = await prisma.user.findFirst({
                where: { linearUserId: story.owner_ids?.[0] },
                select: { githubUsername: true }
            });

            const createdIssueResponse = await got.post(
                `${GITHUB.REPO_ENDPOINT}/${repoFullName}/issues`,
                {
                    headers: defaultHeaders,
                    json: {
                        title: `[${storyName}] ${story.name}`,
                        body: modifiedDescription,
                        ...(assignee?.githubUsername && {
                            assignee: assignee.githubUsername
                        })
                    }
                }
            );

            if (createdIssueResponse.statusCode > 201) {
                const reason = `Failed to create issue for ${story.id} with status ${createdIssueResponse.statusCode}.`;
                console.log(reason);
                throw new ApiError(reason, 500);
            }

            const createdIssueData: components["schemas"]["issue"] = JSON.parse(
                createdIssueResponse.body
            );

            const attachmentQuery = getAttachmentQuery(
                story.id,
                createdIssueData.number,
                repoFullName
            );

            await Promise.all([
                shortcutQuery(`/attachments`, shortcutKey, 'POST', attachmentQuery).then(response => {
                    if (!response || response.error) {
                        console.log(
                            `Failed to add attachment to ${storyName} for ${createdIssueData.id}`
                        );
                    } else {
                        console.log(
                            `Added attachment to ${storyName} for ${createdIssueData.id}`
                        );
                    }
                }),
                prisma.syncedIssue.create({
                    data: {
                        githubIssueId: createdIssueData.id,
                        shortcutStoryId: story.id.toString(),
                        shortcutTeamId: story.epic_id?.toString(),
                        githubIssueNumber: createdIssueData.number,
                        shortcutStoryNumber: story.id,
                        githubRepoId: repoId
                    }
                })
            ]);

            // Apply all labels to newly-created issue
            for (const label of story.labels || []) {
                if (label.name === SHORTCUT.GITHUB_LABEL) continue;

                const { createdLabel, error: createLabelError } = await createLabel({
                    repoFullName,
                    label: {
                        name: label.name,
                        color: label.color.replace('#', '')
                    },
                    githubAuthHeader: defaultHeaders.Authorization,
                    userAgentHeader: defaultHeaders["User-Agent"]
                });

                if (createLabelError) {
                    console.log(
                        `Could not create label "${label.name}" in ${repoFullName}.`
                    );
                    continue;
                }

                const labelName = createdLabel ? createdLabel.name : label.name;
                const { error: applyLabelError } = await applyLabel({
                    repoFullName,
                    issueNumber: createdIssueData.number,
                    labelNames: [labelName],
                    githubAuthHeader: defaultHeaders.Authorization,
                    userAgentHeader: defaultHeaders["User-Agent"]
                });

                if (applyLabelError) {
                    console.log(
                        `Could not apply label "${labelName}" to #${createdIssueData.id} in ${repoFullName}.`
                    );
                } else {
                    console.log(
                        `Applied label "${labelName}" to #${createdIssueData.id} in ${repoFullName}.`
                    );
                }
            }

                if (error) {
                    console.log(
                        `Could not create GH label "${label.name}" in ${repoFullName}.`
                    );
                    continue;
                }

                const labelName = createdLabel ? createdLabel.name : label.name;

                labelNames.push(labelName);
            }

            // Add priority label if applicable
            if (!!data.priority && SHARED.PRIORITY_LABELS[data.priority]) {
                const priorityLabel = SHARED.PRIORITY_LABELS[data.priority];

                const { createdLabel, error } = await createLabel({
                    repoFullName,
                    label: priorityLabel,
                    githubAuthHeader,
                    userAgentHeader
                });

                if (error) {
                    console.log(
                        `Could not create priority label "${priorityLabel.name}" in ${repoFullName}.`
                    );
                } else {
                    const labelName = createdLabel
                        ? createdLabel.name
                        : priorityLabel.name;

                    labelNames.push(labelName);
                }
            }

            const { error: applyLabelError } = await applyLabel({
                repoFullName,
                issueNumber: BigInt(createdIssueData.number),
                labelNames,
                githubAuthHeader,
                userAgentHeader
            });

            if (applyLabelError) {
                console.log(
                    `Could not apply labels to #${createdIssueData.id} in ${repoFullName}.`
                );
            } else {
                console.log(
                    `Applied labels to #${createdIssueData.id} in ${repoFullName}.`
                );
            }

            if (!syncs.some(s => s.shortcutUserId === data.creatorId)) {
                await inviteMember(
                    data.creatorId,
                    data.teamId,
                    repoFullName,
                    shortcut
                );
            }
        }
    }
}
