import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../prisma";
import { createLabel } from "../../../utils/shortcut-utils";

export default async function handle(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== "POST") {
        return res.setHeader("Allow", "POST").status(405).send({
            error: "Only POST requests are accepted"
        });
    }

    const { repoName, label } = req.body;
    if (!repoName || !label?.name || !label?.color) {
        return res
            .status(400)
            .send({ error: "Request is missing repo name or label details" });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ error: "Request is missing auth token" });
    }

    try {
        const sync = await prisma.sync.findFirst({
            where: {
                GitHubRepo: {
                    repoName: repoName
                }
            },
            include: {
                ShortcutTeam: true
            }
        });

        if (!sync?.ShortcutTeam) {
            return res.status(404).send({ error: "Team not found" });
        }

        await createLabel(
            sync.shortcutApiKey,
            sync.ShortcutTeam.teamId,
            { name: label.name, color: label.color }
        );

        return res.status(200).json({ message: "Label created successfully" });
    } catch (err) {
        return res.status(500).send({ error: err.message });
    }
}

