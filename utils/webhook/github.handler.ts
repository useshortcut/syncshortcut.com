import prisma from "../../prisma";
import { createHmac, timingSafeEqual } from "crypto";
import {
    decrypt,
    getAttachmentQuery,
    getSyncFooter,
    skipReason,
    generateShortcutUUID
} from "../index";
import {
    createComment,
    prepareMarkdownContent,
    upsertUser,
    updateComment
} from "../../pages/api/utils";
import {
    IssueCommentCreatedEvent,
    IssuesAssignedEvent,
    IssuesEvent,
    IssuesLabeledEvent,
    IssuesUnassignedEvent,
    IssuesUnlabeledEvent,
    MilestoneEvent,
    IssueCommentEditedEvent
} from "@octokit/webhooks-types";
import { GENERAL, GITHUB, SHARED } from "../constants";
import got from "got";
import { shortcutQuery } from "../api/shortcut-query";
import { ApiError } from "../errors";

export async function githubWebhookHandler(
    body: IssuesEvent | IssueCommentCreatedEvent | MilestoneEvent,
    signature: string,
    githubEvent: string
) {
    const { repository, sender, action } = body;

    if (!!(body as IssuesEvent)?.issue?.pull_request) {
        return "Pull request event.";
    }

    let sync =
        !!repository?.id && !!sender?.id
            ? await prisma.sync.findFirst({
                  where: {
                      githubRepoId: repository.id,
                      githubUserId: sender.id
                  },
                  include: {
                      GitHubRepo: true,
                      ShortcutTeam: true
                  }
              })
            : null;

    if (
        (!sync?.ShortcutTeam || !sync?.GitHubRepo) &&
        !process.env.SHORTCUT_APPLICATION_ADMIN_KEY
    ) {
        throw new ApiError(
            `Team not found (repo: ${repository?.id || ""})`,
            404
        );
    }

    // Get the issue from the event and treat it as a story
    const { issue: story }: IssuesEvent = body as unknown as IssuesEvent;

    let anonymousUser = false;
    if (!sync) {
        anonymousUser = true;
        sync = !!repository?.id
            ? await prisma.sync.findFirst({
                  where: {
                      githubRepoId: repository.id
                  },
                  include: {
                      GitHubRepo: true,
                      ShortcutTeam: true
                  }
              })
            : null;

        if (!sync) {
            throw new ApiError(
                `Sync not found (repo: ${repository?.id || ""})`,
                404
            );
        }
    }

    const HMAC = createHmac("sha256", sync.GitHubRepo?.webhookSecret ?? "");
    const digest = Buffer.from(
        `sha256=${HMAC.update(JSON.stringify(body)).digest("hex")}`,
        "utf-8"
    );
    const sig = Buffer.from(signature, "utf-8");

    if (sig.length !== digest.length || !timingSafeEqual(digest, sig)) {
        throw new ApiError(
            `GH webhook secret doesn't match (repo: ${repository?.id || ""})`,
            403
        );
    }

    const {
        shortcutUserId,
        shortcutApiKey,
        shortcutApiKeyIV,
        githubUserId,
        githubApiKey,
        githubApiKeyIV,
        ShortcutTeam: {
            publicLabelId,
            doneStateId,
            startedStateId,
            archivedStateId,
            teamId: shortcutTeamId
        },
        GitHubRepo: { repoName }
    } = sync;

    let shortcutKey = process.env.SHORTCUT_API_KEY
        ? process.env.SHORTCUT_API_KEY
        : decrypt(shortcutApiKey, shortcutApiKeyIV);

    if (anonymousUser) {
        shortcutKey = process.env.SHORTCUT_APPLICATION_ADMIN_KEY;
    }

    const shortcut = {
        apiKey: shortcutKey
    };

    const githubKey = process.env.GITHUB_API_KEY
        ? process.env.GITHUB_API_KEY
        : decrypt(githubApiKey, githubApiKeyIV);

    const githubAuthHeader = `token ${githubKey}`;
    const userAgentHeader = `${repoName}, shortcut-github-sync`;
    const defaultHeaders = {
        headers: {
            "User-Agent": userAgentHeader,
            Authorization: githubAuthHeader
        }
    };

    const issuesEndpoint = `https://api.github.com/repos/${repoName}/issues`;

    if (!anonymousUser) {
        // Map the user's GitHub username to their Shortcut username if not yet mapped
        await upsertUser(
            shortcutKey,
            githubUserId,
            shortcutUserId,
            userAgentHeader,
            githubAuthHeader
        );
    }

    const syncedStory = !!repository?.id
        ? await prisma.syncedIssue.findFirst({
              where: {
                  githubIssueNumber: story?.number,
                  githubRepoId: repository.id
              }
          })
        : null;

    if (githubEvent === "issue_comment" && action === "edited") {
        if (!syncedStory) return skipReason("comment", story.number);

        const { comment } = body as IssueCommentEditedEvent;
        const regex = /ShortcutCommentId:(.*?):/;
        const match = comment.body.match(regex);
        const isShortcutCommentIdPresent = match && match[1];

        if (isShortcutCommentIdPresent) {
            const shortcutCommentId = match[1];
            const modifiedComment = await prepareMarkdownContent(
                comment.body,
                "github"
            );
            await updateComment(
                shortcutKey,
                syncedStory.shortcutStoryId,
                shortcutCommentId,
                modifiedComment
            );
        }
    }

    if (githubEvent === "issue_comment" && action === "created") {
        // Comment created

        if (anonymousUser) {
            const modifiedComment = await prepareMarkdownContent(
                (body as IssueCommentCreatedEvent).comment.body,
                "github"
            );
            await createComment(
                shortcutKey,
                syncedStory.shortcutStoryId,
                modifiedComment
            );
        } else {
            const { comment } = body as IssueCommentCreatedEvent;

            if (comment.body.includes("on Shortcut")) {
                return skipReason("comment", story.number, true);
            }

            if (!syncedStory) return skipReason("comment", story.number);

            const modifiedComment = await prepareMarkdownContent(
                comment.body,
                "github"
            );

            await createComment(
                shortcutKey,
                syncedStory.shortcutStoryId,
                modifiedComment
            );
        }
    }

    // Ensure the event is for a story
    if (githubEvent !== "issues") return "Not a story event.";

    if (action === "edited") {
        // Story edited

        if (!syncedStory) return skipReason("edit", story.number);

        const title = story.title.split(`${syncedStory.shortcutStoryNumber}]`);
        if (title.length > 1) title.shift();

        const description = story.body?.split("<sub>");

        if ((description?.length || 0) > 1) description?.pop();

        const modifiedDescription = await prepareMarkdownContent(
            description?.join("<sub>"),
            "github"
        );

        await shortcutQuery(
            `stories/${syncedStory.shortcutStoryId}`,
            shortcutKey,
            'PUT',
            {
                name: title.join(`${syncedStory.shortcutStoryNumber}]`),
                description: modifiedDescription
            }
        ).then(updatedStory => {
            if (!updatedStory?.data) {
                console.error(
                    `Story edit failed: ${syncedStory.shortcutStoryNumber} for #${story.number} (repo: ${repository.id}).`
                );
            } else {
                console.log(
                    `Edited story for GitHub story #${story.number}.`
                );
            }
        });
    } else if (["closed", "reopened"].includes(action)) {
        // Story closed or reopened

        if (!syncedStory) return skipReason("edit", story.number);

        await shortcutQuery(
            `stories/${syncedStory.shortcutStoryId}`,
            shortcutKey,
            'PUT',
            {
                workflow_state_id:
                    story.state_reason === "not_planned"
                        ? archivedStateId
                        : story.state_reason === "completed"
                        ? doneStateId
                        : startedStateId
            }
        ).then(updatedStory => {
            if (!updatedStory?.data) {
                console.error(
                    `State change failed: ${syncedStory.shortcutStoryNumber} for #${story.number} (repo: ${repository.id}).`
                );
            } else {
                console.log(
                    `Changed state for GitHub story #${story.number}.`
                );
            }
        });
    } else if (
        action === "opened" ||
        (action === "labeled" &&
            body.label?.name?.toLowerCase() === "shortcut")
    ) {
        // Story opened or special "shortcut" label added

        if (syncedStory) {
            return `Not creating: ${story?.id || ""} exists as ${
                syncedStory.shortcutStoryId
            } (repo: ${repository.id}).`;
        }

        if (story.title.match(GENERAL.SHORTCUT_STORY_ID_REGEX)) {
            return `Skipping creation as story ${story.number}'s title seems to contain a Shortcut story ID.`;
        }

        const modifiedDescription = await prepareMarkdownContent(
            story.body,
            "github",
            {
                anonymous: anonymousUser,
                sender: sender
            }
        );

        // Collect other labels on the story
        const githubLabels = story.labels.filter(
            label => label.name !== "shortcut"
        );

        const shortcutLabels = await shortcutQuery(
            `/api/v3/labels`,
            shortcutKey,
            'GET',
            {
                teamId: shortcutTeamId,
                name: {
                    in: githubLabels.map(label =>
                        label.name.trim().toLowerCase()
                    )
                }
            }
        );

        const assignee = await prisma.user.findFirst({
            where: { githubUserId: story.assignee?.id },
            select: { shortcutUserId: true }
        });

        const createdStoryData = await shortcutQuery(
            'stories',
            shortcutKey,
            'POST',
            {
                id: generateShortcutUUID(),
                name: story.title,
                description: `${modifiedDescription ?? ""}`,
                teamId: shortcutTeamId,
                labelIds: [
                    ...shortcutLabels?.nodes?.map(node => node.id),
                    publicLabelId
                ],
                ...(story.assignee?.id &&
                    assignee && {
                        ownerIds: [assignee.shortcutUserId]
                    })
            }
        );

        if (!createdStoryData?.data) {
            const reason = `Failed to create story for #${story.number} (repo: ${repository.id}).`;
            throw new ApiError(reason, 500);
        }

        const createdStory = createdStoryData.data;

        if (!createdStory) {
            console.log(
                `Failed to fetch created story for #${story.number} (repo: ${repository.id}).`
            );
        } else {
            const team = createdStory.team;

            if (!team) {
                console.log(
                    `Failed to fetch team for ${createdStory.id} for #${story.number} (repo: ${repository.id}).`
                );
            } else {
                const storyName = `${team.key}-${createdStory.number}`;
                const attachmentQuery = getAttachmentQuery(
                    createdStory.id,
                    story.number,
                    repoName
                );

                const [
                    newSyncedStory,
                    titleRenameResponse,
                    attachmentResponse
                ] = await Promise.all([
                    prisma.syncedIssue.create({
                        data: {
                            githubIssueNumber: story.number,
                            githubIssueId: story.id,
                            shortcutStoryId: createdStory.id,
                            shortcutStoryNumber: createdStory.number,
                            shortcutTeamId: team.id,
                            githubRepoId: repository.id
                        }
                    }),
                    got.patch(`${issuesEndpoint}/${story.number}`, {
                        json: {
                            title: `[${storyName}] ${story.title}`,
                            body: `${story.body}\n\n<sub>[${storyName}](${createdStory.url})</sub>`
                        },
                        ...defaultHeaders
                    }),
                    shortcutQuery(
                        'attachments',
                        shortcutKey,
                        'POST',
                        attachmentQuery
                    )
                ]);

                if (titleRenameResponse.statusCode > 201) {
                    console.log(
                        `Failed to update title for ${
                            createdStory?.id || ""
                        } on ${story.id} with status ${
                            titleRenameResponse.statusCode
                        } (repo: ${repository.id}).`
                    );
                }

                if (!attachmentResponse?.data?.attachmentCreate?.success) {
                    console.log(
                        `Failed to add attachment to ${
                            createdStory?.id || ""
                        } for ${story.id}: ${
                            attachmentResponse?.error || ""
                        } (repo: ${repository.id}).`
                    );
                }

                // Add issue comment history to newly-created Shortcut story
                if (action === "labeled") {
                    const commentsPayload = await got.get(
                        `${GITHUB.REPO_ENDPOINT}/${repository.full_name}/issues/${story.number}/comments`,
                        { ...defaultHeaders }
                    );

                    if (commentsPayload.statusCode > 201) {
                        throw new ApiError(
                            `Failed to fetch comments for ${story.id} with status ${commentsPayload.statusCode} (repo: ${repository.id}).`,
                            403
                        );
                    }

                    const comments = JSON.parse(commentsPayload.body);

                    for await (const comment of comments) {
                        const modifiedComment = await prepareMarkdownContent(
                            comment.body,
                            "github"
                        );

                        await createComment(
                            shortcut.apiKey,
                            newSyncedStory.shortcutStoryId,
                            modifiedComment
                        );
                    }
                }
            }
        }
    } else if (["assigned", "unassigned"].includes(action)) {
        // Assignee changed

        if (!syncedStory) return skipReason("assignee", story.number);

        const { assignee: modifiedAssignee } = body as
            | IssuesAssignedEvent
            | IssuesUnassignedEvent;

        const shortcutStory = await shortcutQuery(`stories/${syncedStory.shortcutStoryId}`, shortcutKey, 'GET');
        const shortcutAssignee = shortcutStory?.data?.assignee;

        const remainingAssignee = story?.assignee?.id
            ? await prisma.user.findFirst({
                  where: { githubUserId: story?.assignee?.id },
                  select: { shortcutUserId: true }
              })
            : null;

        if (action === "unassigned") {
            // Remove assignee

            // Set remaining assignee only if different from current
            if (shortcutAssignee?.id != remainingAssignee?.shortcutUserId) {
                const response = await shortcutQuery(
                    `stories/${syncedStory.shortcutStoryId}`,
                    shortcutKey,
                    'PUT',
                    { assigneeId: remainingAssignee?.shortcutUserId || null }
                );

                if (!response?.success) {
                    const reason = `Failed to unassign on ${syncedStory.shortcutStoryId} for ${story.id} (repo: ${repository.id}).`;
                    throw new ApiError(reason, 500);
                } else {
                    return `Removed assignee from Shortcut story for GitHub story #${story.number}.`;
                }
            }
        } else if (action === "assigned") {
            // Add assignee

            const newAssignee = modifiedAssignee?.id
                ? await prisma.user.findFirst({
                      where: { githubUserId: modifiedAssignee?.id },
                      select: { shortcutUserId: true }
                  })
                : null;

            if (!newAssignee) {
                return `Skipping assignee for ${story.id}: Shortcut user not found for GH user ${modifiedAssignee?.login}`;
            }

            if (shortcutAssignee?.id != newAssignee?.shortcutUserId) {
                const response = await shortcutQuery(
                    `stories/${syncedStory.shortcutStoryId}`,
                    shortcutKey,
                    'PUT',
                    { assigneeId: newAssignee.shortcutUserId }
                );

                if (!response?.success) {
                    const reason = `Failed to assign on ${syncedStory.shortcutStoryId} for ${story.id} (repo: ${repository.id}).`;
                    throw new ApiError(reason, 500);
                } else {
                    return `Assigned ${syncedStory.shortcutStoryId} for ${story.id} (repo: ${repository.id}).`;
                }
            }
        }
    } else if (["milestoned", "demilestoned"].includes(action)) {
        // Milestone added or removed from story

        // Sync the newly-milestoned story
        if (!syncedStory) {
            if (action === "demilestoned") {
                return `Skipping milestone removal for ${story.id}: not synced (repo: ${repository.id}).`;
            }

            const modifiedDescription = await prepareMarkdownContent(
                story.body,
                "github",
                {
                    anonymous: anonymousUser,
                    sender: sender
                }
            );

            const assignee = await prisma.user.findFirst({
                where: { githubUserId: story.assignee?.id },
                select: { shortcutUserId: true }
            });

            const createdStoryData = await shortcutQuery(
                '/api/v3/stories',
                shortcutKey,
                'POST',
                {
                    id: generateShortcutUUID(),
                    title: story.title,
                    description: `${modifiedDescription ?? ""}`,
                    teamId: shortcutTeamId,
                    labelIds: [publicLabelId],
                    ...(story.assignee?.id &&
                        assignee && {
                            assigneeId: assignee.shortcutUserId
                        })
                }
            );

            if (!createdStoryData.success) {
                throw new ApiError(
                    `Failed to create story for ${story.id} (repo: ${repository.id}).`,
                    500
                );
            }

            const createdStory = await createdStoryData.story;

            if (!createdStory) {
                console.log(
                    `Failed to fetch created story for ${story.id} (repo: ${repository.id}).`
                );
            } else {
                const team = await createdStory.team;

                if (!team) {
                    console.log(
                        `Failed to fetch team for ${createdStory.id} for ${story.id} (repo: ${repository.id}).`
                    );
                } else {
                    const storyName = `${team.key}-${createdStory.number}`;
                    const attachmentQuery = getAttachmentQuery(
                        createdStory.id,
                        story.number,
                        repoName
                    );

                    // Add to DB, update title, add attachment to story, and fetch comments in parallel
                    const [
                        newSyncedStory,
                        titleRenameResponse,
                        attachmentResponse,
                        issueCommentsPayload
                    ] = await Promise.all([
                        prisma.syncedIssue.create({
                            data: {
                                githubIssueNumber: story.number,
                                githubIssueId: story.id,
                                shortcutStoryId: createdStory.id,
                                shortcutStoryNumber: createdStory.number,
                                shortcutTeamId: team.id,
                                githubRepoId: repository.id
                            }
                        }),
                        got.patch(`${issuesEndpoint}/${story.number}`, {
                            json: {
                                title: `[${storyName}] ${story.title}`,
                                body: `${story.body}\n\n<sub>[${storyName}](${createdStory.url})</sub>`
                            },
                            ...defaultHeaders
                        }),
                        shortcutQuery(attachmentQuery, shortcutKey),
                        got.get(`${issuesEndpoint}/${story.number}/comments`, {
                            ...defaultHeaders
                        })
                    ]);

                    if (titleRenameResponse.statusCode > 201) {
                        console.log(
                            `Failed to update title for ${
                                createdStory?.id || ""
                            } on ${story.id} with status ${
                                titleRenameResponse.statusCode
                            } (repo: ${repository.id}).`
                        );
                    }

                    if (!attachmentResponse?.data?.attachmentCreate?.success) {
                        console.log(
                            `Failed to add attachment to ${
                                createdStory?.id || ""
                            } for ${story.id}: ${
                                attachmentResponse?.error || ""
                            } (repo: ${repository.id})`
                        );
                    }

                    if (issueCommentsPayload.statusCode > 201) {
                        throw new ApiError(
                            `Failed to fetch comments for ${story.id} with status ${issueCommentsPayload.statusCode} (repo: ${repository.id}).`,
                            403
                        );
                    }

                    // Add story comment history to newly-created Shortcut story
                    const comments = JSON.parse(issueCommentsPayload.body);
                    for await (const comment of comments) {
                        const modifiedComment = await prepareMarkdownContent(
                            comment.body,
                            "github"
                        );

                        await createComment(
                            shortcutKey,
                            newSyncedStory.shortcutStoryId,
                            modifiedComment
                        );
                    }
                }
            }
        }

        const { milestone } = story;

        if (milestone === null) {
            return `Skipping over removal of milestone for story #${story.number}.`;
        }

        const isEpic = milestone.description?.includes?.("(Epic)");

        let syncedMilestone = await prisma.milestone.findFirst({
            where: {
                milestoneId: milestone.number,
                githubRepoId: repository.id
            }
        });

        if (!syncedMilestone) {
            if (milestone.description?.includes(getSyncFooter())) {
                return `Skipping over milestone "${milestone.title}" because it is caused by sync`;
            }

            const createdResource = await shortcutQuery(
                isEpic ? "/api/v3/epics" : "/api/v3/iterations",
                shortcutKey,
                'POST',
                {
                    name: milestone.title,
                    description: `${milestone.description}\n\n> ${getSyncFooter()}`,
                    ...(isEpic && { teamIds: [shortcutTeamId] }),
                    ...(!isEpic && { teamId: shortcutTeamId }),
                    ...(isEpic && {
                        targetDate: milestone.due_on
                            ? new Date(milestone.due_on)
                            : null,
                        startDate: new Date()
                    }),
                    ...(!isEpic && {
                        endsAt: milestone.due_on
                            ? new Date(milestone.due_on)
                            : null,
                        startsAt: new Date()
                    })
                }
            );

            if (!createdResource?.success) {
                const reason = `Failed to create Shortcut epic/iteration for milestone ${milestone.id}.`;
                throw new ApiError(reason, 500);
            }

            const resourceData = await createdResource[
                isEpic ? "epic" : "iteration"
            ];

            syncedMilestone = await prisma.milestone.create({
                data: {
                    milestoneId: milestone.number,
                    githubRepoId: repository.id,
                    iterationId: resourceData.id,
                    shortcutTeamId: shortcutTeamId
                }
            });
        }

        const response = await shortcutQuery(
            `stories/${syncedStory.shortcutStoryId}`,
            shortcutKey,
            'PUT',
            {
                ...(isEpic
                    ? { epic_id: syncedMilestone.iterationId }
                    : { iteration_id: syncedMilestone.iterationId })
            }
        );

        if (!response?.data) {
            const reason = `Failed to add Shortcut story to epic/iteration for ${syncedStory.shortcutStoryId}.`;
            throw new ApiError(reason, 500);
        } else {
            return `Added Shortcut story to epic/iteration for ${syncedStory.shortcutStoryId}.`;
        }
    } else if (["labeled", "unlabeled"].includes(action)) {
        // Label added to issue

        if (!syncedStory) return skipReason("label", syncedStory.shortcutStoryId);

        const { label } = body as IssuesLabeledEvent | IssuesUnlabeledEvent;

        const shortcutLabels = await shortcutQuery(
            'labels',
            shortcutKey,
            'GET',
            {
                teamId: shortcutTeamId,
                name: label?.name
                    ? label.name.trim().toLowerCase()
                    : ''
            }
        );

        const priorityLabels = Object.values(SHARED.PRIORITY_LABELS);
        if (priorityLabels.map(l => l.name).includes(label?.name)) {
            await shortcutQuery(
                `stories/${syncedStory.shortcutStoryId}`,
                shortcutKey,
                'PUT',
                {
                    priority:
                        action === "unlabeled"
                            ? null
                            : priorityLabels.find(l => l.name === label?.name)
                                  ?.value
                }
            );
        }

        if (!shortcutLabels?.data?.length) {
            return `Skipping label "${label?.name}" for ${syncedStory.shortcutStoryId} as no Shortcut label was found (repo: ${repository.id}).`;
        }

        const shortcutLabelIDs = shortcutLabels.data.map(l => l.id);

        const story = await shortcutQuery(
            `stories/${syncedStory.shortcutStoryId}`,
            shortcutKey,
            'GET'
        );

        const currentStoryLabels = story?.data?.labels || [];
        const currentStoryLabelIDs = currentStoryLabels.map(n => n.id);

        const response = await shortcutQuery(
            `stories/${syncedStory.shortcutStoryId}`,
            shortcutKey,
            'PUT',
            {
                labelIds: [
                    ...(action === "labeled" ? shortcutLabelIDs : []),
                    ...currentStoryLabelIDs.filter(
                        id => !shortcutLabelIDs.includes(id)
                    )
                ]
            }
        );

        if (!response?.data) {
            const reason = `Failed to add label "${label?.name}" to ${syncedStory.shortcutStoryId} for ${syncedStory.shortcutStoryId} (repo: ${repository.id}).`;
            throw new ApiError(reason, 500);
        }

        return `Added label "${label?.name}" to Shortcut story for ${syncedStory.shortcutStoryId} (repo: ${repository.id}).`;
    }
}
