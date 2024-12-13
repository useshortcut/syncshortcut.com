import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../prisma";

// POST /api/shortcut/save
export default async function handle(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (!req.body)
        return res.status(400).send({ error: "Request is missing body" });
    if (req.method !== "POST")
        return res.status(405).send({
            message: "Only POST requests are accepted."
        });

    const {
        teamId,
        teamName,
        publicLabelId,
        archivedStateId,
        doneStateId,
        startedStateId
    } = JSON.parse(req.body);

    if (!teamId) {
        return res
            .status(400)
            .send({ error: "Failed to save team: missing team ID" });
    } else if (!teamName) {
        return res
            .status(400)
            .send({ error: "Failed to save team: missing team name" });
    } else if (
        [publicLabelId, archivedStateId, doneStateId, startedStateId].some(
            id => id === undefined
        )
    ) {
        return res
            .status(400)
            .send({ error: "Failed to save team: missing label or state" });
    }

    try {
        const result = await prisma.shortcutTeam.upsert({
            where: { teamId: teamId },
            update: {
                teamName,
                publicLabelId,
                archivedStateId,
                doneStateId,
                startedStateId
            },
            create: {
                teamId,
                teamName,
                publicLabelId,
                archivedStateId,
                doneStateId,
                startedStateId
            }
        });

        return res.status(200).json(result);
    } catch (err) {
        return res.status(400).send({
            error: `Failed to save team with error: ${err.message || ""}`
        });
    }
}

