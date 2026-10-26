// Language model providers the user can pick in Settings. Pure data, shared by lib/llm.js and the settings page.
//
// Anthropic is the tested provider. Model ids from the claude-api skill model table (cached 2026-10-06):
// claude-sonnet-5-5 (Claude Sonnet 5.5, default) and claude-haiku-5-5 (Claude Haiku 5.5).
//
// The OpenAI-compatible adapter is experimental. Browser (CORS) support of each preset was checked on 2026-10-19
// with a preflight OPTIONS request and a POST with a fake key from an outside origin (no real key, no prompt):
// - OpenAI: preflight 200, Access-Control-Allow-Origin echoes the origin; POST 401 carries "*". Allowed.
// - OpenRouter: preflight 204 with "*", POST 401 with "*". Allowed.
// - Gemini (OpenAI-compatible endpoint): preflight 200 and POST 400 both echo the origin. Allowed. A 2025 forum
//   thread reported CORS errors on this path; today's check passed.
// - Ollama (local): allows browser calls by default only from localhost, 127.0.0.1 and 0.0.0.0 origins (Ollama
//   FAQ; checked with a local server: http://127.0.0.1:3100 and http://localhost:3100 got 204, an https site
//   origin got 403). Any other site needs OLLAMA_ORIGINS set before `ollama serve`.

export const ANTHROPIC = "anthropic";
export const OPENAI_COMPATIBLE = "openai_compatible";

export const ANTHROPIC_MODELS = [
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (default)" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (faster, lower cost)" },
];
export const DEFAULT_ANTHROPIC_MODEL = ANTHROPIC_MODELS[0].id;

export const EXPERIMENTAL_LABEL = "Experimental: tested with two Gemini models.";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);
export const isLocalSite = (hostname) => LOCAL_HOSTS.has(String(hostname || "").toLowerCase());

export const OPENAI_PRESETS = [
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "", keyNeeded: true,
    cors: "Allows calls from the browser (checked 2026-10-19)." },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "", keyNeeded: true,
    cors: "Allows calls from the browser (checked 2026-10-19)." },
  { id: "gemini", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.8-flash", keyNeeded: true,
    cors: "Allows calls from the browser (checked 2026-10-19). Uses Google's OpenAI-compatible endpoint, which is in beta." },
  { id: "ollama", label: "Ollama (on this computer)", baseUrl: "http://localhost:11434/v1", model: "", keyNeeded: false,
    localOnly: true,
    cors: "Works when SmartBite itself runs on this computer (localhost). Ollama blocks browser calls from other sites unless you start it with OLLAMA_ORIGINS set to this site's address." },
  { id: "custom", label: "Other OpenAI-compatible endpoint", baseUrl: "", model: "", keyNeeded: false,
    cors: "Works only if that endpoint allows calls from a browser (CORS)." },
];

export const presetById = (id) => OPENAI_PRESETS.find((p) => p.id === id) || OPENAI_PRESETS[0];

// A preset is offered only where the browser can reach it: Ollama only when this site runs on localhost
export const presetAvailable = (preset, hostname) => !preset.localOnly || isLocalSite(hostname);
