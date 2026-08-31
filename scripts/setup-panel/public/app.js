import { detectLang, persistLang, t } from "./i18n.js";

const STEP_IDS = [
  { id: "env", labelKey: "stepEnv" },
  { id: "name", labelKey: "stepName" },
  { id: "docker", labelKey: "stepDocker" },
  { id: "olares", labelKey: "stepOlares" },
  { id: "ssh", labelKey: "stepSsh" },
  { id: "done", labelKey: "stepDone" },
];

const CHECK_LABEL = {
  node: "envNode",
  "olares-cli": "envCli",
  docker: "envDocker",
  "olares-image": "envImage",
  ssh: "envSsh",
};

const state = {
  lang: detectLang(),
  view: "env",
  skipHub: false,
  hubReady: false,
  sshReady: false,
  config: null,
  preflight: null,
  finished: false,
  lastError: null,
};

const $ = (id) => document.getElementById(id);

function tr(key) {
  return t(state.lang, key);
}

function applyStaticText() {
  document.documentElement.lang = state.lang === "en" ? "en" : "zh-CN";
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = tr(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", tr(el.dataset.i18nPlaceholder));
  });
  $("lang-zh").classList.toggle("active", state.lang === "zh");
  $("lang-en").classList.toggle("active", state.lang === "en");
  if (state.finished) {
    const finish = $("finish-btn");
    finish.textContent = tr("finished");
    finish.disabled = true;
  }
  if (state.lastError) {
    $(state.lastError.id).textContent = state.lastError.key
      ? tr(state.lastError.key)
      : state.lastError.message;
  }
  if (state.hubReady && $("docker-ok").textContent === "") {
    $("docker-ok").textContent = tr("probeOk");
  }
  if (state.sshReady && $("ssh-ok").textContent === "") {
    $("ssh-ok").textContent = tr("sshProbeOk");
  }
  syncDockerNext();
  syncSshNext();
  syncSshSkip();
  renderSshHost();
}

function renderSteps() {
  $("steps").innerHTML = STEP_IDS.map((s) => {
    const cls = s.id === state.view ? "current" : isBefore(s.id) ? "done" : "";
    return `<li class="${cls}">${tr(s.labelKey)}</li>`;
  }).join("");
}

function isBefore(id) {
  return STEP_IDS.findIndex((s) => s.id === id) < STEP_IDS.findIndex((s) => s.id === state.view);
}

function show(view) {
  state.view = view;
  document.querySelectorAll(".card").forEach((el) => el.classList.add("hidden"));
  $(`view-${view}`).classList.remove("hidden");
  applyStaticText();
  renderSteps();
  if (state.config && view === "done") renderSummary(state.config);
  if (state.preflight && view === "env") renderEnv(state.preflight);
}

function setError(id, message, key) {
  if (!message) {
    state.lastError = null;
    $(id).textContent = "";
    return;
  }
  state.lastError = { id, message, key: key || "" };
  $(id).textContent = message;
}

function errorText(data, fallback) {
  const main = data?.errorKey ? tr(data.errorKey) : data?.error || fallback || tr("requestFailed");
  if (data?.errorKey && data?.error && data.error !== main) {
    return `${main}（${data.error}）`;
  }
  return main;
}

async function api(path, body) {
  const post = body !== undefined;
  let res;
  try {
    res = await fetch(path, {
      method: post ? "POST" : "GET",
      headers: {
        "x-lang": state.lang,
        ...(post ? { "content-type": "application/json" } : {}),
      },
      body: post ? JSON.stringify(body ?? {}) : undefined,
    });
  } catch {
    throw new Error(tr("requestFailed"));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const err = new Error(errorText(data));
    err.errorKey = data.errorKey || "";
    throw err;
  }
  return data;
}

function fillFromConfig(cfg, project) {
  $("appName").value = cfg.appName || project.name || "";
  $("hubRepo").value = cfg.dockerHub?.repository || "";
  $("hubUser").value = cfg.dockerHub?.username || "";
  $("desktopUrl").value = cfg.olares?.desktopUrl || "";
  $("sshUser").value = cfg.olares?.sshUser || "root";
  $("sshPort").value = Number(cfg.olares?.sshPort) > 0 && Number(cfg.olares.sshPort) !== 22 ? String(Number(cfg.olares.sshPort)) : "";
  state.skipHub = Boolean(cfg.dockerHub?.skip) || cfg.imageMode === "save";
  state.hubReady = Boolean(cfg.dockerHub?.loggedIn) && !state.skipHub;
  state.sshReady = Boolean(cfg.olares?.sshOk);
}

function renderEnv(preflight) {
  const list = $("env-list");
  const next = $("env-next");
  if (!list) return;
  const checks = preflight?.checks || [];
  list.innerHTML = checks
    .map((c) => {
      const label = tr(CHECK_LABEL[c.id] || c.id);
      const ver = c.version || tr("envMissing");
      const cls = c.ok ? "env-ok" : "env-fail";
      const mark = c.ok ? "ok" : "fail";
      return `<li class="${cls}"><span>${label}</span><code>${ver}</code><span>${mark}</span></li>`;
    })
    .join("");
  if (next) next.disabled = !preflight?.ok;
  const blocking = checks.find((c) => !c.ok && c.id !== "ssh");
  const sshFail = checks.find((c) => c.id === "ssh" && !c.ok);
  if (blocking) setError("env-error", tr(blocking.errorKey), blocking.errorKey);
  else if (sshFail) setError("env-error", tr(sshFail.errorKey), sshFail.errorKey);
  else setError("env-error");
}

function renderSummary(cfg) {
  const rows = [
    ["sumName", cfg.appName],
    ["sumMode", cfg.imageMode === "push" ? tr("sumModePush") : tr("sumModeSave")],
    ["sumRepo", cfg.dockerHub.repository || tr("sumSkipped")],
    ...(cfg.imageMode === "push"
      ? [["sumHubAuth", tr("sumHubAuthDocker")]]
      : []),
    ["sumDesktop", cfg.olares.desktopUrl],
    ["sumId", cfg.olares.olaresId],
    ["sumLan", cfg.olares.lanIp || "—"],
    ["sumSsh", sshSummary(cfg)],
    ["sumPlatform", cfg.platform || "—"],
  ];
  $("summary").innerHTML = rows.map(([k, v]) => `<dt>${tr(k)}</dt><dd>${v}</dd>`).join("");
}

function setLang(lang) {
  state.lang = lang === "en" ? "en" : "zh";
  persistLang(state.lang);
  show(state.view);
}

function sshUserValue() {
  return $("sshUser").value.trim() || state.config?.olares?.sshUser || "root";
}

function sshPortValue() {
  const raw = $("sshPort")?.value.trim() || "";
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 65535 ? n : 0;
}

function sshSummary(cfg) {
  const host = cfg.olares.sshHost || cfg.olares.lanIp || "";
  const user = cfg.olares.sshUser || "root";
  const port = Number(cfg.olares.sshPort) || 0;
  if (!host) return "—";
  const who = `${user}@${host}`;
  return port > 0 && port !== 22 ? `${who}:${port}` : who;
}

function sshFieldsReady() {
  const user = $("sshUser").value.trim();
  const host = state.config?.olares?.lanIp || state.config?.olares?.sshHost || "";
  if (!user || !host) return false;
  if ($("sshPass").value) return true;
  const savedUser = state.config?.olares?.sshUser || "root";
  const savedPort = Number(state.config?.olares?.sshPort) || 0;
  const port = sshPortValue();
  const normalizedPort = port === 22 ? 0 : port;
  const normalizedSaved = savedPort === 22 ? 0 : savedPort;
  return Boolean(state.config?.olares?.sshOk) && user === savedUser && normalizedPort === normalizedSaved;
}

function renderSshHost() {
  const el = $("ssh-host");
  if (!el) return;
  const host = state.config?.olares?.lanIp || state.config?.olares?.sshHost || "";
  const user = sshUserValue();
  const port = sshPortValue() || Number(state.config?.olares?.sshPort) || 0;
  if (!host) {
    el.textContent = tr("sshHostMissing");
    return;
  }
  const who = `${user}@${host}`;
  el.textContent = `${tr("sshHostLabel")} ${port > 0 && port !== 22 ? `${who}:${port}` : who}`;
}

function syncDockerNext() {
  const next = $("docker-next");
  if (!next) return;
  next.disabled = !state.hubReady;
}

function syncSshNext() {
  const next = $("ssh-next");
  if (!next) return;
  next.disabled = !state.sshReady;
}

function syncSshSkip() {
  const skip = $("ssh-skip");
  if (!skip) return;
  skip.classList.toggle("hidden", state.skipHub);
}

function resetHubReady() {
  state.hubReady = false;
  $("docker-ok").textContent = "";
  syncDockerNext();
}

function resetSshReady() {
  state.sshReady = false;
  $("ssh-ok").textContent = "";
  syncSshNext();
  renderSshHost();
}

async function boot() {
  applyStaticText();
  const data = await api("/api/state");
  state.config = data.config;
  state.preflight = data.preflight || { ok: false, checks: [] };
  fillFromConfig(data.config, data.project);
  if (data.complete) {
    renderSummary(data.config);
    show("done");
  } else {
    show("env");
  }
}

function closePanel() {
  window.close();
  setTimeout(() => {
    if (!window.closed) {
      window.location.replace("about:blank");
    }
  }, 150);
}

function busy(button, on) {
  if (!button) return;
  button.disabled = on
    ? true
    : button === $("docker-next")
      ? !state.hubReady
      : button === $("ssh-next")
        ? !state.sshReady
        : false;
  button.classList.toggle("busy", on);
}

document.getElementById("lang-zh").addEventListener("click", () => setLang("zh"));
document.getElementById("lang-en").addEventListener("click", () => setLang("en"));

for (const id of ["hubRepo", "hubUser", "hubPass"]) {
  $(id).addEventListener("input", resetHubReady);
}

for (const id of ["sshUser", "sshPort", "sshPass"]) {
  $(id).addEventListener("input", () => {
    resetSshReady();
    renderSshHost();
  });
}

document.querySelector(".panel").addEventListener("click", async (event) => {
  const next = event.target.dataset.next;
  const back = event.target.dataset.back;
  if (!next && !back) return;
  const button = event.target;

  try {
    if (back) {
      show(back);
      return;
    }

    if (next === "env") {
      setError("env-error");
      if (!state.preflight?.ok) {
        const failed = (state.preflight?.checks || []).find((c) => !c.ok);
        setError("env-error", tr(failed?.errorKey || "requestFailed"), failed?.errorKey);
        return;
      }
      show("name");
      return;
    }

    if (next === "name") {
      setError("name-error");
      busy(button, true);
      await api("/api/step/name", { appName: $("appName").value.trim() });
      show("docker");
      return;
    }

    if (next === "docker-skip") {
      setError("docker-error");
      $("docker-ok").textContent = "";
      busy(button, true);
      await api("/api/step/docker", { skip: true });
      state.skipHub = true;
      state.hubReady = false;
      $("hubPass").value = "";
      show("olares");
      return;
    }

    if (next === "docker-probe") {
      setError("docker-error");
      $("docker-ok").textContent = "";
      busy(button, true);
      const data = await api("/api/step/docker-probe", {
        repository: $("hubRepo").value.trim(),
        username: $("hubUser").value.trim(),
        password: $("hubPass").value,
      });
      $("hubPass").value = "";
      state.skipHub = false;
      state.hubReady = true;
      state.config = data.config;
      $("docker-ok").textContent = tr("probeOk");
      syncDockerNext();
      return;
    }

    if (next === "docker") {
      setError("docker-error");
      if (!state.hubReady) {
        setError("docker-error", tr("hub_probe_required"), "hub_probe_required");
        return;
      }
      show("olares");
      return;
    }

    if (next === "olares") {
      setError("olares-error");
      busy(button, true);
      const data = await api("/api/step/olares", {
        desktopUrl: $("desktopUrl").value.trim(),
        password: $("olaresPass").value,
        totp: $("olaresTotp").value.trim(),
      });
      $("olaresPass").value = "";
      $("olaresTotp").value = "";
      state.config = data.config;
      state.sshReady = Boolean(data.config?.olares?.sshOk);
      if (!state.sshReady) $("ssh-ok").textContent = "";
      $("sshPort").value =
        Number(data.config?.olares?.sshPort) > 0 && Number(data.config.olares.sshPort) !== 22
          ? String(Number(data.config.olares.sshPort))
          : "";
      show("ssh");
      return;
    }

    if (next === "ssh-skip") {
      if (state.skipHub) {
        setError("ssh-error", tr("ssh_probe_required"), "ssh_probe_required");
        return;
      }
      show("done");
      if (state.config) renderSummary(state.config);
      return;
    }

    if (next === "ssh-probe") {
      setError("ssh-error");
      $("ssh-ok").textContent = "";
      if (!state.config?.olares?.lanIp && !state.config?.olares?.sshHost) {
        setError("ssh-error", tr("lan_ip_required"), "lan_ip_required");
        return;
      }
      if (!sshFieldsReady()) {
        setError(
          "ssh-error",
          tr($("sshUser").value.trim() ? "ssh_password_required" : "ssh_user_required"),
          $("sshUser").value.trim() ? "ssh_password_required" : "ssh_user_required",
        );
        return;
      }
      busy(button, true);
      const data = await api("/api/step/ssh", {
        username: sshUserValue(),
        port: sshPortValue(),
        password: $("sshPass").value,
      });
      $("sshPass").value = "";
      state.sshReady = true;
      state.config = data.config;
      $("sshPort").value =
        Number(data.config?.olares?.sshPort) > 0 && Number(data.config.olares.sshPort) !== 22
          ? String(Number(data.config.olares.sshPort))
          : "";
      $("ssh-ok").textContent = tr("sshProbeOk");
      syncSshNext();
      renderSshHost();
      return;
    }

    if (next === "ssh") {
      setError("ssh-error");
      if (!state.sshReady) {
        setError("ssh-error", tr("ssh_probe_required"), "ssh_probe_required");
        return;
      }
      if (state.config) renderSummary(state.config);
      show("done");
      return;
    }

    if (next === "finish") {
      setError("done-error");
      busy(button, true);
      const data = await api("/api/finish", {});
      state.config = data.config;
      state.finished = true;
      renderSummary(data.config);
      button.textContent = tr("finished");
      button.disabled = true;
      closePanel();
    }
  } catch (err) {
    const map = {
      env: "env-error",
      name: "name-error",
      docker: "docker-error",
      "docker-skip": "docker-error",
      "docker-probe": "docker-error",
      ssh: "ssh-error",
      "ssh-probe": "ssh-error",
      "ssh-skip": "ssh-error",
      olares: "olares-error",
      finish: "done-error",
    };
    if (next === "docker-probe") {
      state.hubReady = false;
      $("docker-ok").textContent = "";
      syncDockerNext();
    }
    if (next === "ssh-probe") {
      state.sshReady = false;
      $("ssh-ok").textContent = "";
      syncSshNext();
    }
    setError(map[next] || "olares-error", err.message, err.errorKey);
  } finally {
    if (!state.finished) busy(button, false);
  }
});

boot().catch((err) => {
  $("env-error").textContent = err.message;
  show("env");
});
