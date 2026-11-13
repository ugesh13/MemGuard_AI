// Builds a garak generator-option file and the command to run it.
// Field names follow garak's documented REST generator (rest.RestGenerator) and the
// OpenAI-compatible generator. CLI flag names changed across garak versions, so both are shown.

const URL_RE = /^https?:\/\/[^\s"'<>]{1,200}$/i;
const MODEL_RE = /^[A-Za-z0-9._:/@-]{1,100}$/;
const ENV_RE = /^[A-Z_][A-Z0-9_]{0,63}$/;
const JSONPATH_RE = /^\$[A-Za-z0-9_.[\]'"-]{0,100}$/;
const PROBE_SETS = {
  memorization: "leakreplay",
  quick: "leakreplay,encoding",
  broad: "leakreplay,encoding,promptinject,dan",
};

export function validate(input) {
  const errors = {};
  const kind = input.kind;
  if (!["openai_compatible", "rest"].includes(kind)) errors.kind = "Choose OpenAI-compatible or REST.";
  if (!URL_RE.test(String(input.base_url || ""))) errors.base_url = "Enter an http(s) URL.";
  if (kind === "openai_compatible" && !MODEL_RE.test(String(input.model_name || ""))) errors.model_name = "Letters, numbers and . _ : / @ - only.";
  if (!ENV_RE.test(String(input.api_key_env || ""))) errors.api_key_env = "Use an environment variable NAME like TARGET_API_KEY (not the key itself).";
  if (kind === "rest" && input.response_field && !JSONPATH_RE.test(String(input.response_field))) errors.response_field = "Use a JSONPath such as $.text";
  if (input.probe_set && !PROBE_SETS[input.probe_set]) errors.probe_set = "Unknown probe set.";
  return errors;
}

export function buildGarakConfig(input) {
  const probes = PROBE_SETS[input.probe_set || "memorization"];
  const keyRef = "$" + input.api_key_env;
  let config, filename = "garak-target.json", modern, legacy;
  if (input.kind === "rest") {
    config = {
      rest: {
        RestGenerator: {
          name: "memguard-target",
          uri: input.base_url,
          method: "post",
          headers: { Authorization: `Bearer ${keyRef}`, "Content-Type": "application/json" },
          req_template_json_object: { prompt: "$INPUT" },
          response_json: true,
          response_json_field: input.response_field || "$.text",
        },
      },
    };
    modern = `python -m garak --target_type rest --generator_option_file ${filename} --probes ${probes} --report_prefix memguard`;
    legacy = `python -m garak --model_type rest --generator_option_file ${filename} --probes ${probes} --report_prefix memguard`;
  } else {
    config = {
      openai: {
        OpenAICompatible: {
          uri: input.base_url,
          model: input.model_name,
          api_key: keyRef,
        },
      },
    };
    modern = `python -m garak --target_type openai.OpenAICompatible --target_name ${input.model_name} --generator_option_file ${filename} --probes ${probes} --report_prefix memguard`;
    legacy = `python -m garak --model_type openai.OpenAICompatible --model_name ${input.model_name} --generator_option_file ${filename} --probes ${probes} --report_prefix memguard`;
  }
  return {
    config_filename: filename,
    config,
    commands: { modern, legacy },
    notes: [
      "Flag names differ between garak versions. Run `python -m garak --help` and use the line that matches.",
      `Set ${input.api_key_env} in your own shell. MemGuard never receives the key.`,
      "When garak finishes, upload the *.report.jsonl file in the Import step.",
    ],
  };
}
