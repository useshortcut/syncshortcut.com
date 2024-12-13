import got from "got";
import type { NextApiResponse } from "next/types";
import prisma from "../../prisma";
import type {
    GitHubIssueLabel,
    GitHubMarkdownOptions,
    Platform
} from "../../typings";
import { GITHUB } from "../../utils/constants";
import {
    replaceImgTags,
    replaceStrikethroughTags,
    replaceGithubComment
} from "../../utils";
import {
    Issue,
    IssueCommentCreatedEvent,
    IssuesEvent,
    Repository,
    User
} from "@octokit/webhooks-types";
import { ApiError } from "../../utils/errors";
import {
    createComment,
    createLabel,
    handleError,
    mapUsernames,
    updateComment,
    upsertUser
} from "../../utils/shortcut-utils";

/**
 * Server-only utility functions
 */
export default (_, res: NextApiResponse) => {
    return res.status(200).send({ message: "Nothing to see here!" });
};

export {
    createComment,
    createLabel,
    handleError,
    mapUsernames,
    updateComment,
    upsertUser
};

export async function replaceMentions(
    body: string,
    platform: Platform
): Promise<string> {
    const mentionRegex = /@([a-zA-Z0-9-]+)/g;
    const mentionMatches = body.matchAll(mentionRegex);

    const userMentions =
        Array.from(mentionMatches)?.map(mention => mention?.[0]) ?? [];

    const userMentionReplacements = await mapUsernames(userMentions, platform);
    const swapPlatform = platform === "shortcut" ? "github" : "shortcut";

    userMentionReplacements.forEach(mention => {
        const replacementRegex = new RegExp(`@${mention}`, "g");
        body = body.replace(replacementRegex, `@${mention}`);
    });

    return body;
}

export async function prepareMarkdownContent(
    body: string,
    platform: Platform,
    options?: GitHubMarkdownOptions
): Promise<string> {
    let sanitizedBody = body;

    // Replace image tags
    sanitizedBody = replaceImgTags(sanitizedBody);

    // Replace strikethrough
    sanitizedBody = replaceStrikethroughTags(sanitizedBody);

    // Replace user mentions
    sanitizedBody = await replaceMentions(sanitizedBody, platform);

    // Replace GitHub comment syntax
    if (platform === "shortcut" && options?.sender) {
        sanitizedBody = replaceGithubComment(sanitizedBody);
    }

    return sanitizedBody;
}
