import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../prisma";
import { encrypt } from "../../utils";

// POST /api/save
export default async function handle(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (!req.body)
        return res.status(400).send({ message: "Request is missing body" });
    if (req.method !== "POST") {
        return res.status(405).send({
            message: "Only POST requests are accepted."
        });
    }

    const { github, shortcut } = JSON.parse(req.body);

    // Check for each required field
    if (!github?.userId) {
        return res
            .status(404)
            .send({ error: "Failed to save sync: missing GH user ID" });
    } else if (!github?.repoId) {
        return res
            .status(404)
            .send({ error: "Failed to save sync: missing GH repo ID" });
    } else if (!shortcut?.userId) {
        return res
            .status(404)
            .send({ error: "Failed to save sync: missing Shortcut user ID" });
    } else if (!shortcut?.teamId) {
        return res
            .status(404)
            .send({ error: "Failed to save sync: missing Shortcut team ID" });
    } else if (!shortcut?.apiKey || !github?.apiKey) {
        return res
            .status(404)
            .send({ error: "Failed to save sync: missing API key" });
    }

    // Encrypt the API keys
    const { hash: shortcutApiKey, initVector: shortcutApiKeyIV } = encrypt(
        shortcut.apiKey
    );
    const { hash: githubApiKey, initVector: githubApiKeyIV } = encrypt(
        github.apiKey
    );

    try {
        await prisma.sync.upsert({
            where: {
                githubUserId_shortcutUserId_githubRepoId_shortcutTeamId: {
                    githubUserId: github.userId,
                    githubRepoId: github.repoId,
                    shortcutUserId: shortcut.userId,
                    shortcutTeamId: shortcut.teamId
                }
            },
            update: {
                githubApiKey,
                githubApiKeyIV,
                shortcutApiKey,
                shortcutApiKeyIV
            },
            create: {
                // GitHub
                githubUserId: github.userId,
                githubRepoId: github.repoId,
                githubApiKey,
                githubApiKeyIV,

                // Shortcut
                shortcutUserId: shortcut.userId,
                shortcutTeamId: shortcut.teamId,
                shortcutApiKey,
                shortcutApiKeyIV
            }
        });

        return res.status(200).send({ message: "Saved successfully" });
    } catch (err) {
        console.log("Error saving sync:", err.message);
        return res.status(404).send({
            error: `Failed to save sync with error: ${err.message || ""}`
        });
    }
}

