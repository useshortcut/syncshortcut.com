# Troubleshooting

Having issues? Read through this guide before raising an issue on the repo to see if any of the following solutions work for you.

- Also be sure to check [issues](https://github.com/calcom/syncshortcut.com/issues) for an open or closed item that relates to the issue you are having.

## Shortcut not syncing data to GitHub

In order for data to sync from Shortcut to GitHub, your Shortcut account must have both:
- the SyncShortcut application installed
- the SyncShortcut webhook

### Shortcut application

To ensure the application is installed, see [Shortcut application settings](https://app.shortcut.com/settings/account/security). You should see the app installed.

[Note: Screenshot needs to be updated for Shortcut UI]

### Shortcut webhook

For the webhook, you can see your existing webhooks under [webhook settings](https://app.shortcut.com/settings/api).

You should have a Shortcut webhook with the following configuration. If it's not there and you've already set SyncShortcut up, you can add it manually.

[Note: Screenshot needs to be updated for Shortcut UI]

Your Shortcut data should now be syncing to GitHub!

## GitHub not syncing data to Shortcut

If you are having issues with GitHub syncing to Shortcut, your GitHub account must have both:
- The SyncShortcut OAuth application installed
- The SyncShortcut webhook in GitHub

### GitHub application

To ensure the application is installed, see [GitHub application settings](https://github.com/settings/applications).

Under the `Authorized OAuth Apps` You should see the SyncShortcut installed.

### GitHub webhook

Finally, we can ensure that the webhook GitHub triggers when an event occurs is functioning correctly. See:

`https://github.com/<your-org>/<your-repo>/settings/hooks`

You should see a webhook to `https://syncshortcut.com/api`. Have a look at the **Recent Deliveries** tab.

Are there any webhooks failing? If your integration is not working and you are seeing errors, please [raise an issue](https://github.com/calcom/syncshortcut.com/issues/new) with the body/error message of the webhook request.

[Note: Screenshot needs to be updated for new webhook URL]
