import React, { createContext, useState } from "react";
import { GitHubContext, GitHubRepo, ShortcutContext, Sync } from "../typings";

interface IProps {
    syncs: Sync[];
    setSyncs: (syncs: Sync[]) => void;
    gitHubToken: string;
    setGitHubToken: (token: string) => void;
    gitHubUser: GitHubRepo;
    setGitHubUser: (user: GitHubRepo) => void;
    shortcutContext: ShortcutContext;
    setShortcutContext: (shortcutContext: ShortcutContext) => void;
    gitHubContext: GitHubContext;
    setGitHubContext: (context: GitHubContext) => void;
}

export const Context = createContext<IProps>(null);

const ContextProvider = ({ children }: { children: React.ReactNode }) => {
    const [syncs, setSyncs] = useState<Sync[]>([]);
    const [gitHubToken, setGitHubToken] = useState("");
    const [gitHubUser, setGitHubUser] = useState<GitHubRepo>();
    const [shortcutContext, setShortcutContext] = useState<ShortcutContext>({
        userId: "",
        teamId: "",
        apiKey: ""
    });
    const [gitHubContext, setGitHubContext] = useState<GitHubContext>({
        userId: "",
        repoId: "",
        apiKey: ""
    });

    return (
        <Context.Provider
            value={{
                syncs,
                setSyncs,
                gitHubToken,
                setGitHubToken,
                gitHubUser,
                setGitHubUser,
                shortcutContext,
                setShortcutContext,
                gitHubContext,
                setGitHubContext
            }}
        >
            {children}
        </Context.Provider>
    );
};

export default ContextProvider;

