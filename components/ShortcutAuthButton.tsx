import { CheckIcon, DotsHorizontalIcon } from "@radix-ui/react-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ShortcutContext } from "../typings/shortcut.d";
import { ShortcutMember, ShortcutWorkflowState, ShortcutTeam } from "../typings/shortcut.d";
import { clearURLParams } from "../utils";
import { v4 as uuid } from "uuid";
import { SHORTCUT } from "../utils/constants";
import DeployButton from "./DeployButton";
import {
    getShortcutWebhook,
    updateShortcutWebhook,
    getShortcutContext,
    getShortcutAuthURL,
    exchangeShortcutToken
} from "../utils/shortcut";
import Select from "./Select";

interface IProps {
    onAuth: (apiKey: string) => void;
    onDeployWebhook: (context: ShortcutContext) => void;
    restoredApiKey: string;
    restored: boolean;
}

const ShortcutAuthButton = ({
    onAuth,
    onDeployWebhook,
    restoredApiKey,
    restored
}: IProps) => {
    const [accessToken, setAccessToken] = useState("");
    const [teams, setTeams] = useState<Array<ShortcutTeam>>([]);
    const [chosenTeam, setChosenTeam] = useState<ShortcutTeam>();
    const [storyStates, setStoryStates] = useState<{
        [key in keyof typeof SHORTCUT.STORY_STATES]: ShortcutWorkflowState;
    }>();
    const [user, setUser] = useState<ShortcutMember>();
    const [deployed, setDeployed] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (accessToken) return;

        const authResponse = new URLSearchParams(window.location.search);
        if (!authResponse.has("code")) return;

        const verificationCode = localStorage.getItem("shortcut-verification");
        if (!authResponse.get("state")?.includes("shortcut")) return;
        if (authResponse.get("state") !== verificationCode) {
            alert("Shortcut auth returned an invalid code. Please try again.");
            return;
        }

        setLoading(true);

        const refreshToken = authResponse.get("code");
        exchangeShortcutToken(refreshToken)
            .then(body => {
                if (body.access_token) setAccessToken(body.access_token);
                else {
                    clearURLParams();
                    localStorage.removeItem(SHORTCUT.STORAGE_KEY);
                }
                setLoading(false);
            })
            .catch(err => {
                alert(`Error fetching access token: ${err}`);
                setLoading(false);
            });
    }, [accessToken]);

    useEffect(() => {
        if (restoredApiKey) setAccessToken(restoredApiKey);
    }, [restoredApiKey]);

    useEffect(() => {
        if (!accessToken) return;
        if (user?.id) return;

        onAuth(accessToken);

        getShortcutContext(accessToken)
            .then(res => {
                if (!res?.data?.teams || !res.data?.viewer)
                    alert("No Shortcut user or teams found");

                setTeams(res.data.teams.nodes);
                setUser(res.data.viewer);
            })
            .catch(err => alert(`Error fetching labels: ${err}`));
    }, [accessToken]);

    useEffect(() => {
        if (!chosenTeam || !accessToken) return;

        setLoading(true);

        getShortcutWebhook(accessToken, chosenTeam.name)
            .then(res => {
                if (res?.resourceTypes?.length) {
                    setDeployed(true);
                    onDeployWebhook({
                        userId: user.id,
                        teamId: chosenTeam.id,
                        apiKey: accessToken
                    });
                } else {
                    setDeployed(false);
                }
                setLoading(false);
            })
            .catch(err => {
                alert(`Error checking for existing labels: ${err}`);
                setLoading(false);
            });
    }, [chosenTeam, accessToken, user]);

    useEffect(() => {
        const states = chosenTeam?.workflow_states;
        if (!states || !states?.length) return;

        setStoryStates({
            todo: states.find(s => s.name === SHORTCUT.STORY_STATES.todo),
            done: states.find(s => s.name === SHORTCUT.STORY_STATES.done),
            archived: states.find(s => s.name === SHORTCUT.STORY_STATES.archived)
        });
    }, [chosenTeam]);

    const openShortcutAuth = () => {
        const verificationCode = `shortcut-${uuid()}`;
        localStorage.setItem("shortcut-verification", verificationCode);

        const authURL = getShortcutAuthURL(verificationCode);
        window.location.replace(authURL);
    };

    const deployWebhook = useCallback(() => {
        if (!chosenTeam || deployed) return;

        updateShortcutWebhook(accessToken, chosenTeam.name, {
            resourceTypes: Object.keys(SHORTCUT.STORY_STATES)
        })
            .then(() => {
                setDeployed(true);
                onDeployWebhook({
                    userId: user.id,
                    teamId: chosenTeam.id,
                    apiKey: accessToken
                });
            })
            .catch(err => {
                if (err?.message?.includes("url not unique")) {
                    alert("Webhook already deployed");
                    setDeployed(true);
                    onDeployWebhook({
                        userId: user.id,
                        teamId: chosenTeam.id,
                        apiKey: accessToken
                    });
                    return;
                }

                setDeployed(false);
                alert(`Error deploying webhook: ${err}`);
            });

        setDeployed(true);
    }, [accessToken, chosenTeam, deployed, user]);

    const missingStoryState = useMemo<boolean>(() => {
        return (
            !storyStates || Object.values(storyStates).some(state => !state)
        );
    }, [storyStates]);

    return (
        <div className="center space-y-8 w-80">
            <button
                onClick={openShortcutAuth}
                disabled={!!accessToken || loading}
                className={loading ? "animate-pulse" : ""}
                arial-label="Authorize with Shortcut"
            >
                {loading ? (
                    <>
                        <span>Loading</span>
                        <DotsHorizontalIcon className="w-6 h-6" />
                    </>
                ) : (
                    <span>1. Connect Shortcut</span>
                )}
                {!!accessToken && <CheckIcon className="w-6 h-6" />}
            </button>
            {teams.length > 0 && restored && (
                <div className="flex flex-col items-center w-full space-y-4">
                    <Select
                        values={teams.map(team => ({
                            value: team.id,
                            label: team.name
                        }))}
                        onChange={(id: string) =>
                            setChosenTeam(teams.find(team => team.id === id))
                        }
                        disabled={loading}
                        placeholder="3. Find your team"
                    />
                    {chosenTeam?.workflow_states && (
                        <div className="w-full space-y-4 pb-4">
                            {Object.entries(SHORTCUT.STORY_STATES).map(
                                ([key, label]: [keyof typeof SHORTCUT.STORY_STATES, string]) => (
                                    <div
                                        key={key}
                                        className="flex justify-between items-center gap-4"
                                    >
                                        <p className="whitespace-nowrap">
                                            "{label}" label:
                                        </p>
                                        <Select
                                            placeholder={
                                                storyStates?.[key]?.name ||
                                                "Select a label"
                                            }
                                            values={chosenTeam.workflow_states.map(
                                                state => ({
                                                    value: state.id.toString(),
                                                    label: state.name
                                                })
                                            )}
                                            onChange={(id: string) =>
                                                setStoryStates({
                                                    ...storyStates,
                                                    [key]: chosenTeam.workflow_states.find(
                                                        state => state.id === parseInt(id, 10)
                                                    )
                                                })
                                            }
                                            disabled={loading}
                                        />
                                    </div>
                                )
                            )}
                        </div>
                    )}
                    {chosenTeam && (
                        <DeployButton
                            disabled={missingStoryState}
                            loading={loading}
                            deployed={deployed}
                            onDeploy={deployWebhook}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

export default ShortcutAuthButton;

