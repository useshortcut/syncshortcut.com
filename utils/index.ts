import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { GitHubContext, ShortcutContext } from "../typings";
import { GENERAL, GITHUB } from "./constants";
import { v4 as uuidv4 } from 'uuid';

export const isDev = (): boolean => {
    return process.env.NODE_ENV === "development";
};

export const getWebhookURL = (): string => {
    if (typeof window == "undefined") {
        // TODO: Support ngrok URLs for local development
        return "https://syncshortcut.com/api";
    }

    if (window.location.hostname === "localhost") return "https://example.com";
    return `${window.location.origin}/api`;
};

export const copyToClipboard = (text: string) => {
    if (!window?.navigator) alert("Cannot copy to clipboard");

    navigator?.clipboard?.writeText(text);
};

export const formatJSON = (body: object): string => {
    return JSON.stringify(body, null, 4);
};

export const clearURLParams = () => {
    window.history.replaceState(null, null, window.location.pathname);
};

export const encrypt = (text: string): { hash: string; initVector: string } => {
    const algorithm = "aes-256-ctr";
    const secret = process.env.ENCRYPTION_KEY;

    const initVector = randomBytes(16);
    const cipher = createCipheriv(algorithm, secret, initVector);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);

    return {
        hash: encrypted.toString("hex"),
        initVector: initVector.toString("hex")
    };
};

export const decrypt = (content: string, initVector: string): string => {
    const algorithm = "aes-256-ctr";
    const secret = process.env.ENCRYPTION_KEY;

    const decipher = createDecipheriv(
        algorithm,
        secret,
        Buffer.from(initVector, "hex")
    );
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(content, "hex")),
        decipher.final()
    ]);

    return decrypted.toString();
};

export const replaceImgTags = (text: string): string => {
    try {
        const withInlineImages =
            text?.replace(
                GENERAL.IMG_TAG_REGEX,
                (_, args) => `![image](https://${args})`
            ) || "";

        return withInlineImages;
    } catch (error) {
        console.error(error);
        return text;
    }
};

export const replaceStrikethroughTags = (text: string): string => {
    // To avoid unforeseen infinite loops, only replace the first 10 occurrences
    const tildes = text?.match(/~+/g);
    if (tildes?.length > 10) return text;

    return text?.replace(/(?<!\\)~(?!~)/g, "~~") || text;
};

export const replaceGithubComment = (text: string): string => {
    const regex = /<!--(.*?)-->/g;
    const stringWithoutComments = text.replace(regex, "");
    return stringWithoutComments;
};

export const getSyncFooter = (): string => {
    return `From [SyncShortcut.com](https://syncshortcut.com)`;
};

export const legacySyncFooter = `From [Shortcut-GitHub Sync](https://syncshortcut.com)`;

export const saveSync = async (
    shortcutContext: ShortcutContext,
    githubContext: GitHubContext
) => {
    const data = {
        github: { ...githubContext },
        shortcut: { ...shortcutContext }
    };

    const response = await fetch("/api/save", {
        method: "POST",
        body: JSON.stringify(data)
    });

    return await response.json();
};

export const getAttachmentQuery = (
    storyId: string,
    storyNumber: number,
    repoFullName: string
): string => {
    return `mutation {
        attachmentCreate(input: {
            storyId: "${storyId}"
            title: "GitHub Story #${storyNumber} - ${repoFullName}"
            subtitle: "Synchronized"
            url: "https://github.com/${repoFullName}/issues/${storyNumber}"
            iconUrl: "${GITHUB.ICON_URL}"
        }) {
            success
        }
    }`;
};

export const skipReason = (
    event:
        | "story"
        | "edit"
        | "milestone"
        | "epic"
        | "comment"
        | "state change"
        | "label"
        | "assignee",
    storyNumber: number | string,
    causedBySync = false
): string => {
    return `Skipping over ${event} for story #${storyNumber} as it is ${
        causedBySync ? "caused by sync" : "not synced"
    }.`;
};

export const isNumber = (value: string | number): boolean => {
    return !isNaN(Number(value));
};

export const generateShortcutUUID = (): string => {
    return uuidv4();
};

