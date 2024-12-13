import { NextApiRequest, NextApiResponse } from "next";
import { shortcutWebhookHandler } from "../../utils/webhook/shortcut.handler";
import { githubWebhookHandler } from "../../utils/webhook/github.handler";

export default async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method !== "POST") {
        return res.status(405).send({
            success: false,
            message: "Only POST requests are accepted."
        });
    }

    try {
        /**
         * Shortcut webhook consumer
         */
        if (req.headers["user-agent"] === "Shortcut-Webhook") {
            let originIp = req.headers["x-forwarded-for"];

            if (Array.isArray(originIp)) {
                originIp = originIp[0];
            }

            if (originIp.includes(",")) {
                originIp = originIp.split(",")[0].trim();
            }

            const result = await shortcutWebhookHandler(req.body, originIp);

            if (result) {
                console.log(result);
                return res.status(200).send({
                    success: true,
                    message: result
                });
            }
        } else {
            /**
             * GitHub webhook consumer
             */
            const result = await githubWebhookHandler(
                req.body,
                req.headers["x-hub-signature-256"] as string,
                req.headers["x-github-event"] as string
            );

            if (result) {
                console.log(result);
                return res.status(200).send({
                    success: true,
                    message: result
                });
            }
        }
    } catch (e) {
        return res.status(e.statusCode || 500).send({
            success: false,
            message: e.message
        });
    }

    console.log("Webhook received.");
    return res.status(200).send({
        success: true,
        message: "Webhook received."
    });
};
