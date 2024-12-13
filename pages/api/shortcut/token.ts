import type { NextApiRequest, NextApiResponse } from "next";
import { SHORTCUT } from "../../../utils/constants";

// POST /api/shortcut/token
export default async function handle(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (!req.body) {
        return res.status(400).send({ error: "Request is missing body" });
    }
    if (req.method !== "POST") {
        return res.status(405).send({
            message: "Only POST requests are accepted."
        });
    }

    const { apiToken } = req.body;

    if (!apiToken) {
        return res.status(400).send({ error: "Missing API token" });
    }

    try {
        // Validate the token by making a request to Shortcut API
        const response = await fetch(`${SHORTCUT.API_URL}/member`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Shortcut-Token": apiToken
            }
        });

        if (!response.ok) {
            return res.status(401).send({ error: "Invalid API token" });
        }

        const userData = await response.json();
        return res.status(200).json({
            access_token: apiToken,
            user: userData
        });
    } catch (err) {
        console.error(err);
        return res.status(500).send({
            error: `Failed to validate token: ${err.message || ""}`
        });
    }
}

