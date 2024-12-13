import { formatJSON } from ".";

export const getStoryUpdateError = (
    resource: "state" | "description" | "title" | "assignee",
    data: { number: number; id: string; team: { key: string } },
    syncedStory: { githubIssueNumber: bigint; githubIssueId: bigint },
    updatedIssueResponse: any
): string => {
    return `Failed to update GitHub story ${resource} for ${data.team.key}-${
        data.number
    } [${data.id}] on GitHub story #${syncedStory.githubIssueNumber} [${
        syncedStory.githubIssueId
    }], received status code ${
        updatedIssueResponse.statusCode
    }, body of ${formatJSON(JSON.parse(updatedIssueResponse.body))}.`;
};

export class ApiError extends Error {
    constructor(public message: string, public statusCode: number) {
        super(message);
    }
}
