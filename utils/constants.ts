import colors from "tailwindcss/colors";

export const SECONDS_IN_HOUR = 60 * 60;
export const SECONDS_IN_DAY = 24 * SECONDS_IN_HOUR;
export const SECONDS_IN_YEAR = 365 * SECONDS_IN_DAY;

export const SHORTCUT = {
    API_KEY: process.env.SHORTCUT_API_KEY,
    API_URL: "https://api.app.shortcut.com/api/v3",
    STORAGE_KEY: "shortcut-context",
    GITHUB_LABEL: "shortcut",
    GITHUB_LABEL_COLOR: "#2DA54E",
    WEBHOOK_EVENTS: ["Story", "Comment", "Label"],
    TICKET_STATES: {
        started: "Started",
        done: "Done",
        archived: "Archived"
    }
};

export const SHARED = {
    PRIORITY_LABELS: {
        0: { name: "No priority", color: colors.gray["500"], value: 0 },
        1: { name: "Urgent", color: colors.red["600"], value: 1 },
        2: { name: "High priority", color: colors.orange["500"], value: 2 },
        3: { name: "Medium priority", color: colors.yellow["500"], value: 3 },
        4: { name: "Low priority", color: colors.green["600"], value: 4 }
    }
};

export const GITHUB = {
    OAUTH_ID: process.env.NEXT_PUBLIC_GITHUB_OAUTH_ID,
    OAUTH_URL: "https://github.com/login/oauth/authorize",
    TOKEN_URL: "https://github.com/login/oauth/access_token",
    SCOPES: ["repo", "write:repo_hook", "read:user", "user:email"],
    NEW_TOKEN_URL: "https://github.com/settings/tokens/new",
    TOKEN_NOTE: "Linear-GitHub Sync",
    WEBHOOK_EVENTS: ["issues", "issue_comment", "label"],
    LIST_REPOS_ENDPOINT:
        "https://api.github.com/user/repos?per_page=100&sort=updated",
    USER_ENDPOINT: "https://api.github.com/user",
    REPO_ENDPOINT: "https://api.github.com/repos",
    ICON_URL:
        "https://cdn.discordapp.com/attachments/937628023497297930/988735284504043520/github.png",
    STORAGE_KEY: "github-context",
    UUID_SUFFIX: "decafbad"
};

export const TIMEOUTS = {
    DEFAULT: 3000
};

export const GENERAL = {
    APP_NAME: "Shortcut-GitHub Sync",
    APP_URL: "https://syncshortcut.com",
    CONTRIBUTE_URL: "https://github.com/calcom/syncshortcut.com",
    IMG_TAG_REGEX: /<img.*src=[\'|\"| ]?https?:\/\/(.*?)[\'|\"| ].*\/?>/g,
    INLINE_IMG_TAG_REGEX: /!\[.*?\]\((https:\/\/(?!.*\?signature=).*?)\)/g,
    SHORTCUT_TICKET_ID_REGEX: /^\[\w{1,5}-\d{1,6}\]\s/,
    LOGIN_KEY: "login",
    SYNCED_ITEMS: [
        {
            shortcutField: "Title",
            githubField: "Title",
            toGithub: true,
            toShortcut: true
        },
        {
            shortcutField: "Description",
            githubField: "Description",
            toGithub: true,
            toShortcut: true
        },
        {
            shortcutField: "Labels",
            githubField: "Labels",
            toGithub: true,
            notes: "GitHub labels will be created if they don't yet exist"
        },
        {
            shortcutField: "Assignee",
            githubField: "Assignee",
            toGithub: true,
            toShortcut: true,
            notes: "For authenticated users only. Silently ignored otherwise."
        },
        {
            shortcutField: "Status",
            githubField: "State",
            toGithub: true,
            toShortcut: true,
            notes: "eg. Closed issue in GitHub will be marked as Done in Shortcut"
        },
        {
            shortcutField: "Comments",
            githubField: "Comments",
            toGithub: true,
            toShortcut: true,
            notes: "GitHub comments by non-members are ignored"
        },
        {
            shortcutField: "Priority",
            toGithub: true,
            githubField: "Label"
        },
        {
            shortcutField: "Cycle",
            githubField: "Milestone",
            toGithub: true,
            toShortcut: true,
            notes: "Optional. Milestone due date syncs to cycle end date."
        }
    ]
};

