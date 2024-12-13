import got from "got";
import type { NextApiResponse } from "next/types";
import prisma from "../prisma";
import { SHORTCUT } from "./constants";
import type { Platform } from "../typings";
import { ApiError } from "./errors";

/**
 * Server-only utility functions for Shortcut integration
 */

export async function upsertUser(
    shortcutApiKey: string,
    githubUserId: bigint,
    shortcutUserId: string,
    userAgentHeader: string,
    githubAuthHeader: string
): Promise<void> {
    const existingUser = await prisma.user.findFirst({
        where: {
            AND: {
                githubUserId: githubUserId,
                shortcutUserId: shortcutUserId
            }
        }
    });

    if (!existingUser) {
        console.log("Adding user to users table");

        // Get Shortcut user details
        const shortcutUserResponse = await got.get(
            `${SHORTCUT.API_URL}/member`,
            {
                headers: {
                    "Content-Type": "application/json",
                    "Shortcut-Token": shortcutApiKey
                }
            }
        );
        const shortcutUser = JSON.parse(shortcutUserResponse.body);

        // Get GitHub user details
        const githubUserResponse = await got.get(
            `https://api.github.com/user`,
            {
                headers: {
                    "User-Agent": userAgentHeader,
                    Authorization: githubAuthHeader
                }
            }
        );
        const githubUser = JSON.parse(githubUserResponse.body);

        await prisma.user.upsert({
            where: {
                githubUserId_shortcutUserId: {
                    githubUserId: githubUserId,
                    shortcutUserId: shortcutUserId
                }
            },
            update: {
                githubUsername: githubUser.login,
                githubEmail: githubUser.email ?? "",
                shortcutUsername: shortcutUser.mention_name,
                shortcutEmail: shortcutUser.email ?? ""
            },
            create: {
                githubUserId: githubUserId,
                shortcutUserId: shortcutUserId,
                githubUsername: githubUser.login,
                githubEmail: githubUser.email ?? "",
                shortcutUsername: shortcutUser.mention_name,
                shortcutEmail: shortcutUser.email ?? ""
            }
        });
    }
}

export async function mapUsernames(
    userMentions: string[],
    platform: Platform
): Promise<string[]> {
    if (!userMentions.length) return [];

    const filters = userMentions.map(mention => ({
        OR: [{ githubUsername: mention }, { shortcutUsername: mention }]
    }));

    const existingUsers = await prisma.user.findMany({
        where: { OR: filters }
    });

    return userMentions.map(mention => {
        const user = existingUsers.find(
            u =>
                u.githubUsername === mention ||
                u.shortcutUsername === mention
        );
        if (!user) return mention;
        return platform === "shortcut"
            ? user.shortcutUsername
            : user.githubUsername;
    });
}

export async function createLabel(
    shortcutApiKey: string,
    teamId: string,
    label: { name: string; color: string }
): Promise<void> {
    try {
        await got.post(`${SHORTCUT.API_URL}/labels`, {
            headers: {
                "Content-Type": "application/json",
                "Shortcut-Token": shortcutApiKey
            },
            json: {
                name: label.name,
                color: label.color,
                team_id: teamId
            }
        });
    } catch (error) {
        throw new ApiError(
            `Failed to create Shortcut label: ${error.message}`,
            500
        );
    }
}

export async function createComment(
    shortcutApiKey: string,
    storyId: string,
    body: string
): Promise<void> {
    try {
        await got.post(`${SHORTCUT.API_URL}/stories/${storyId}/comments`, {
            headers: {
                "Content-Type": "application/json",
                "Shortcut-Token": shortcutApiKey
            },
            json: {
                text: body
            }
        });
    } catch (error) {
        throw new ApiError(
            `Failed to create Shortcut comment: ${error.message}`,
            500
        );
    }
}

export async function updateComment(
    shortcutApiKey: string,
    storyId: string,
    commentId: string,
    body: string
): Promise<void> {
    try {
        await got.put(
            `${SHORTCUT.API_URL}/stories/${storyId}/comments/${commentId}`,
            {
                headers: {
                    "Content-Type": "application/json",
                    "Shortcut-Token": shortcutApiKey
                },
                json: {
                    text: body
                }
            }
        );
    } catch (error) {
        throw new ApiError(
            `Failed to update Shortcut comment: ${error.message}`,
            500
        );
    }
}

export function handleError(res: NextApiResponse, error: any) {
    console.error("API Error:", error);
    return res.status(500).json({
        error: error?.message || "An unexpected error occurred"
    });
}
