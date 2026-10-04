import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { io } from "socket.io-client";

const password = "Alto-Local-Test-Only-2026";
const api = "http://127.0.0.1:8001/api";

async function createAccount(request, name = "Alex") {
  const email = `alto-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const response = await request.post(`${api}/auth/register`, {
    data: {
      username: name,
      email,
      password,
      avatar_url: "/avatars/willow.svg",
    },
  });
  expect(
    response.ok(),
    `Registration failed: ${response.status()}`,
  ).toBeTruthy();
  const data = await response.json();
  return {
    email,
    ...data,
    headers: { Authorization: `Bearer ${data.access_token}` },
  };
}

async function login(page, email) {
  await page.goto("/");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Let’s go" }).click();
  await expect(
    page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
}

async function screenshot(page, name) {
  await fs.mkdir("tests/evidence", { recursive: true });
  await page.screenshot({
    path: `tests/evidence/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}

test("sign-in design and registration work on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Alto/);
  await screenshot(page, "auth-desktop");
  await page.getByRole("button", { name: "Join Alto" }).click();
  await page.getByLabel("What should we call you?").fill("Taylor");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`taylor-${Date.now()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sage avatar" }).click();
  await page.getByRole("button", { name: "Create your account" }).click();
  await expect(
    page.getByRole("heading", { name: /Taylor/, level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Your profile and status" }).click();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  await screenshot(page, "auth-mobile");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("real chat, drafts, saved messages, search, editing, themes, and responsive navigation", async ({
  page,
  request,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const account = await createAccount(request);
  const serversResponse = await request.get(`${api}/servers`, {
    headers: account.headers,
  });
  const [server] = await serversResponse.json();
  const secondChannel = await request.post(
    `${api}/servers/${server.id}/channels`,
    {
      headers: account.headers,
      data: { name: "ideas", type: "text", category: "Conversations" },
    },
  );
  expect(secondChannel.ok()).toBeTruthy();
  await request.put(`${api}/servers/${server.id}`, {
    headers: account.headers,
    data: { name: "The Common Room" },
  });
  await request.post(`${api}/servers`, {
    headers: account.headers,
    data: { name: "After Hours" },
  });
  await login(page, account.email);
  await expect(
    page.getByRole("button", { name: "The Common Room", exact: true }),
  ).toBeVisible();
  await screenshot(page, "home-desktop");
  await page
    .getByRole("button", { name: "The Common Room", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Your profile and status" }),
  ).toHaveCount(1);
  const composer = page.getByRole("textbox", {
    name: "Message #general",
    exact: true,
  });
  await composer.fill("A little hello from Alto.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page
      .locator(".message-body")
      .getByText("A little hello from Alto.", { exact: true }),
  ).toBeVisible();
  await expect(composer).toHaveValue("");
  await composer.fill("A thought for later");
  await page.getByRole("button", { name: "ideas", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Message #ideas", exact: true }),
  ).toHaveValue("");
  await page.getByRole("button", { name: "general", exact: true }).click();
  await expect(composer).toHaveValue("A thought for later");
  await page.locator(".message-row").first().hover();
  await page.getByRole("button", { name: "Save message", exact: true }).click();
  await page.getByRole("button", { name: "Saved", exact: true }).click();
  await expect(page.locator(".saved-content")).toHaveText(
    "A little hello from Alto.",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Saved", exact: true }).click();
  await expect(page.locator(".saved-content")).toHaveText(
    "A little hello from Alto.",
  );
  await screenshot(page, "saved-desktop");
  await page.keyboard.press("Control+k");
  await page
    .getByRole("textbox", { name: "Search spaces, channels, and people" })
    .fill("general");
  await page.keyboard.press("Enter");
  await expect(composer).toHaveValue("A thought for later");
  await page.locator(".message-row").first().hover();
  await page.getByRole("button", { name: "More message actions" }).click();
  await page.getByRole("button", { name: "Edit Message", exact: true }).click();
  await composer.fill("A better hello from Alto.");
  await page.getByRole("button", { name: "Save edit" }).click();
  await expect(page.locator(".message-body")).toHaveText(
    "A better hello from Alto.",
  );
  await expect(composer).toHaveValue("");
  await screenshot(page, "chat-desktop");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  for (const [width, height] of [
    [1920, 1080],
    [768, 1024],
    [390, 844],
    [360, 640],
    [1440, 3088],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(
      page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await screenshot(page, `home-${width}x${height}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "The Common Room", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("button", { name: "ideas", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Message #ideas", exact: true }),
  ).toBeVisible();
  await screenshot(page, "chat-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Settings", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "My Account", exact: true }),
  ).toBeVisible();
  await screenshot(page, "settings-desktop");
  await page.getByRole("button", { name: "App Appearance" }).click();
  await page.getByRole("button", { name: /Daylight/ }).click();
  await expect(page.locator("html")).toHaveClass("light");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await screenshot(page, "home-light");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "App Appearance" }).click();
  await page.getByRole("button", { name: /Midnight AMOLED/ }).click();
  await expect(page.locator("html")).toHaveClass("amoled");
  await page.keyboard.press("Escape");
  await screenshot(page, "home-amoled");
  expect(errors).toEqual([]);
});

test("create and join spaces, make a friend, and exchange direct messages", async ({
  page,
  request,
  browser,
}) => {
  const a = await createAccount(request, "Jamie");
  const b = await createAccount(request, "Morgan");
  await login(page, a.email);
  await page
    .getByRole("button", { name: "Create a space", exact: true })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Space name", exact: true })
    .fill("Weekend Club");
  await page.getByRole("button", { name: "Create space", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Message #general", exact: true }),
  ).toBeVisible();
  const spaces = await (
    await request.get(`${api}/servers`, { headers: a.headers })
  ).json();
  const created = spaces.find((s) => s.name === "Weekend Club");
  expect(created).toBeTruthy();
  const contextB = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const pageB = await contextB.newPage();
  await login(pageB, b.email);
  await pageB
    .getByRole("button", { name: "Join a space", exact: true })
    .click();
  await pageB
    .getByRole("textbox", { name: "Invite code", exact: true })
    .fill(created.invite_code);
  await pageB.getByRole("button", { name: "Join space", exact: true }).click();
  await expect(
    pageB.getByRole("textbox", { name: "Message #general", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Friends", exact: true })
    .first()
    .click();
  await page
    .getByPlaceholder("Add friend by username or #ID")
    .fill(`#${b.user.public_id}`);
  await page.getByRole("button", { name: "Add Friend", exact: true }).click();
  await expect(
    page.getByText("Friend request sent", { exact: true }),
  ).toBeVisible();
  const requests = await (
    await request.get(`${api}/friends/`, { headers: b.headers })
  ).json();
  const friendship = requests.find((f) => f.friend_user.id === a.user.id);
  expect(friendship).toBeTruthy();
  expect(
    (
      await request.put(`${api}/friends/${friendship.id}/accept`, {
        headers: b.headers,
      })
    ).ok(),
  ).toBeTruthy();
  await expect(page.getByText("Morgan", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Message", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Message @Morgan", exact: true })
    .fill("See you at the weekend!");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".message-body")).toHaveText(
    "See you at the weekend!",
  );
  await pageB.getByRole("button", { name: "Messages", exact: true }).click();
  await expect(pageB.locator(".message-body")).toHaveText(
    "See you at the weekend!",
  );
  await pageB
    .getByRole("textbox", { name: "Message @Jamie", exact: true })
    .fill("Wouldn’t miss it.");
  await pageB
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await expect(page.locator(".message-body").last()).toHaveText(
    "Wouldn’t miss it.",
  );
  await screenshot(page, "direct-messages");
  await page.getByTitle('Direct transfer for large files', { exact: true }).click();
  await page.getByLabel('Send to', { exact: true }).selectOption(String(b.user.id));
  await page.getByLabel('Choose a file', { exact: true }).setInputFiles({ name: 'weekend-note.txt', mimeType: 'text/plain', buffer: Buffer.from('See you in the common room.') });
  await page.getByRole('button', { name: /Send file directly/ }).click();
  await expect(pageB.getByRole('button', { name: 'Accept Download', exact: true })).toBeVisible();
  const downloaded = pageB.waitForEvent('download');
  await pageB.getByRole('button', { name: 'Accept Download', exact: true }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe('weekend-note.txt');
  expect(await fs.readFile(await file.path(), 'utf8')).toBe('See you in the common room.');
  await screenshot(page, 'direct-file-transfer');
  await contextB.close();
});

test("latest message history, pagination, reactions, threads, and attachments", async ({
  page,
  request,
}) => {
  const account = await createAccount(request, "Casey");
  const [server] = await (
    await request.get(`${api}/servers`, { headers: account.headers })
  ).json();
  const channel = server.channels.find((c) => c.type === "text");
  const socket = io("http://127.0.0.1:8001", {
    auth: { token: account.access_token },
  });
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  try {
    for (let n = 1; n <= 55; n++) {
      const response = await socket
        .timeout(5000)
        .emitWithAck("send_message", {
          channel_id: channel.id,
          content: `History message ${n}`,
        });
      expect(response.ok).toBe(true);
    }
  } finally {
    socket.disconnect();
  }
  await login(page, account.email);
  await page.getByRole("button", { name: server.name, exact: true }).click();
  await expect(page.locator(".message-body").last()).toHaveText(
    "History message 55",
  );
  await expect(page.locator(".message-body").first()).toHaveText(
    "History message 6",
  );
  await page
    .getByRole("button", { name: "Load earlier messages", exact: true })
    .click();
  await expect(page.locator(".message-body")).toHaveCount(55);
  await expect(page.locator(".message-body").first()).toHaveText(
    "History message 1",
  );
  const message = page.locator(".message-row").last();
  await message.hover();
  await message.getByRole("button", { name: "Add Reaction" }).click();
  await page.getByRole("button", { name: "🔥", exact: true }).click();
  await expect(message.getByRole("button", { name: "🔥 1" })).toBeVisible();
  await message.hover();
  await message.getByRole("button", { name: "More message actions" }).click();
  await page
    .getByRole("button", { name: "Reply in Thread", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Reply in thread" })
    .fill("Keeping this thought in a thread.");
  await page
    .getByRole("button", { name: "Send message", exact: true })
    .last()
    .click();
  await expect(
    page
      .locator(".message-body")
      .getByText("Keeping this thought in a thread.", { exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Close thread", exact: true }).click();
  await expect(page.locator(".message-body")).toHaveCount(55);
  await page
    .locator('.message-composer input[type="file"]')
    .setInputFiles({
      name: "hello.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("A small file shared on Alto."),
    });
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.locator(".message-row").last().getByText("hello.txt", { exact: true }),
  ).toBeVisible();
});

test("failed loading offers retry and preserves the authenticated session", async ({
  page,
  request,
}) => {
  const account = await createAccount(request, "Robin");
  await login(page, account.email);
  await page.route("**/api/auth/me", (route) => route.abort("failed"));
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A moment to reconnect." }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => Boolean(localStorage.getItem("discoalto_token"))),
  ).toBe(true);
  await page.unroute("**/api/auth/me");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
});

test("one account dock controls voice, camera, and disconnect with synthetic devices", async ({
  page,
  request,
}) => {
  const account = await createAccount(request, "Sam");
  const [server] = await (
    await request.get(`${api}/servers`, { headers: account.headers })
  ).json();
  await login(page, account.email);
  await page.getByRole("button", { name: server.name, exact: true }).click();
  await page.getByRole("button", { name: "Lounge", exact: true }).click();
  await page
    .getByTitle("View Voice & Video Grid", { exact: true })
    .click();
  await page.getByRole("button", { name: "Join Voice", exact: true }).click();
  await expect(
    page.getByText("Voice connected", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Your profile and status" }),
  ).toHaveCount(1);
  const dock = page.locator(".account-dock");
  await dock.getByRole("button", { name: "Mute mic", exact: true }).click();
  await expect(
    dock.getByRole("button", { name: "Unmute mic", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await dock
    .getByRole("button", { name: "Turn on camera", exact: true })
    .click();
  await expect(
    dock.getByRole("button", { name: "Turn off camera", exact: true }),
  ).toBeVisible();
  await expect.poll(() => page.locator('video').first().evaluate(el => el.readyState)).toBeGreaterThanOrEqual(2);
  await screenshot(page, "voice-and-unified-account-dock");
  await expect(page.locator(".workspace-topbar")).toBeInViewport({ ratio: 1 });
  expect(await page.locator(".workspace-topbar").evaluate(el => el.getBoundingClientRect().top)).toBe(0);
  await page.getByRole("button", { name: "Open voice text chat", exact: true }).click();
  await expect(page.locator(".chat-stream")).toBeVisible();
  await page.getByRole("button", { name: "Close voice text chat", exact: true }).last().click();
  await expect(page.locator(".chat-stream")).toHaveCount(0);
  await dock
    .getByRole("button", { name: "Disconnect voice", exact: true })
    .click();
  await expect(page.getByText("Voice connected", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Join Voice", exact: true }),
  ).toBeVisible();
  const mediaReleased = await page.evaluate(async () => {
    const { voiceManager } = await import("/src/services/webrtcVoice.js");
    return (
      !voiceManager.localAudioStream &&
      !voiceManager.localCameraStream &&
      !voiceManager.localScreenStream
    );
  });
  expect(mediaReleased).toBe(true);
});
