---
name: setup
description: Get the kit working on the user's computer and walk them through keys. Checks what's installed, installs missing agents and programs (after asking), and helps the user get and save API keys without editing files. Use for "set me up", "get started", "install", "add my OpenAI key", "where do I get a key", a fresh clone, or whenever status, setup or an agent run reports something missing.
---

# Setup and keys

The user may not be technical. You do the setup. They only do the steps that need them: typing a password, starting
an app for the first time, logging in through the browser, getting a key. Keep messages short and plain, one step at a
time.

## 1. See where things stand

Run `node scripts/agents.mjs setup` (`setup <agent>` for one agent; add `--json` for yourself). It:

- links the skills, and creates the workspace and each agent's settings file (`.env`, copied from `.env.example`);
- checks the computer (Node, git, Homebrew, the Claude Code login, Docker, FFmpeg) and every agent;
- ends with a to-do list in three parts:
  - **Claude can do these:** commands you run once the user says yes;
  - **these need you:** steps for the user, with links;
  - **optional extras:** keys that unlock more.

Tell the user in two to four lines what works now, what's missing and what you propose. For a single job, check only
that agent (`status <agent>`) and fix only what it needs.

## 2. Install what's missing, after one yes

Ask once for the whole batch: say what each thing is in plain words and roughly how long it takes. Run the installs in
the background, run `status` again when they finish, and tell the user what's ready.

| Missing | Say | You run, after a yes |
|---|---|---|
| an agent | "the deck agent isn't installed yet": a few minutes, and it downloads the browser it draws with | `node scripts/agents.mjs install deck explainer` |
| FFmpeg (explainer) | "a free tool for video files" | `brew install ffmpeg` · Windows: `winget install Gyan.FFmpeg` |
| Node, or Node 22+ (explainer) | "the engine the agents run on" | `brew install node` · Windows: `winget install OpenJS.NodeJS.LTS` |
| Docker Desktop not running (dev) | "the app that runs the developer agent's test machines" | `open -a Docker`, then wait about a minute |

These need the user. Give them the step and wait:

- **Homebrew** (a Mac needs it for `brew install …`): they paste the command from https://brew.sh into Terminal and
  type their Mac password. You can't type passwords.
- **Node without Homebrew:** the LTS installer from https://nodejs.org, then they reopen the editor.
- **Docker Desktop** not installed: they download it from https://www.docker.com/products/docker-desktop/, open it
  once and accept the terms.
- **git** on a Mac: `xcode-select --install` opens a window, and they click Install.
- **The Claude Code login:** `claude auth login` in a terminal opens the browser.

## 3. Keys

### Which keys the user needs

Start from what they want to make, not from the list of keys.

| To make | Needs | Optional |
|---|---|---|
| carousels, decks, explainer videos, landing pages | nothing, if Claude Code is logged in | OpenAI (pictures); ElevenLabs (video narration, music, sound effects) |
| collage posts | a Claude API key and an OpenAI key | |
| features in a GitHub repository (dev) | a Claude subscription token (`claude setup-token`) or a Claude API key, and Docker | a GitHub token, or the GitHub CLI login |

- **A Claude API key is billed per use**, separately from any Claude subscription. Agents that use the Claude Code
  login don't get it by default. Setting it for one of them switches that agent from the subscription to per-use
  billing, so do it only when the user asks: `keys set ANTHROPIC_API_KEY carousel`.
- **Without an OpenAI key**, carousel and deck use placeholder art and explainer draws without pictures. Tell the user.
- **`node scripts/agents.mjs keys`** lists every key: what it's for, what it costs, the page where you make it, which
  agents need it and where it's already set. It shows names only, never values.

### Getting a key and saving it

1. Say in one line what the key unlocks and what it costs. Mention that pay-per-use services need a payment method or
   a little credit first.
2. Run `node scripts/agents.mjs keys ask <NAME>`. On a Mac it opens two windows:
   - the page where the key is made, in the browser;
   - a small Terminal window that shows the steps, asks for the key and saves it in every agent that needs it. Nothing
     shows while the user pastes.

   For the subscription token, the Terminal window runs `claude setup-token` first.
3. Pass on the numbered steps it printed, in your own short words. For example, for OpenAI: "1. Sign in at
   platform.openai.com. 2. Add a payment method under Settings → Billing. 3. Go to API keys → Create new secret key,
   and copy it. 4. Paste it into the Terminal window that just opened and press Enter."
4. When they say they're done, check with `node scripts/agents.mjs keys` (or `status <agent>`).

**If the Terminal window doesn't open:** this happens on Windows and Linux, or when the user declines macOS's request
to let the editor control Terminal. Ask them to open a terminal in this folder and run
`node scripts/agents.mjs keys set <NAME>`. It shows the same steps.

**If they paste the key into the chat:** save it with `printf '%s' '<key>' | node scripts/agents.mjs keys set <NAME>`.
Never repeat the key.

**Other options:**

- `keys set <NAME> <agent…>` saves a key for the named agents only.
- `keys remove <NAME> [agent…]` empties it again, for example to switch an agent back to the subscription.

### Common problems with keys

- **Pictures fail with "organization must be verified"** (OpenAI): Settings → Organization → General → Verify
  Organization, which is an ID check. Then retry.
- **"Invalid API key" or 401:** the key was copied only in part, or it was revoked. Make a new key and save it again.
- **"Insufficient credit" or "quota":** add credit on the provider's billing page.
- **GitHub:** `gh auth login --web` is easier than a token. Install the CLI with `brew install gh` after a yes. dev uses
  that login when `GITHUB_TOKEN` is empty.

## 4. When an install fails

Read the error before retrying, and retry once at most before telling the user.

- **A download times out** (npm, Chromium, HyperFrames' Chrome): run the same install again.
- **Explainer setup says Chrome timed out:** run it once more. Chrome's first launch is slow.
- **`node` or `npm`: command not found:** Node is missing (see step 2).
- **Anything else:** tell the user in one sentence what failed and what you suggest. Show the end of the error only if
  they ask.

## Cowork

The VM can't install anything or open windows on the computer. Give the user exact commands to paste into Terminal on
their computer, starting with `cd` into the folder (its path is in `get_device_info` → `connectedFolders`), for
example `cd ~/superproduct && node scripts/agents.mjs install deck`. `setup`, `status` and `keys` work in the VM for
checking, and so does saving a key the user pasted into the chat.

## Never

- Read, print or `cat` an `.env` file, or put a key in a brief, a commit or a message.
- Install anything without the user's yes, or use `sudo`.
