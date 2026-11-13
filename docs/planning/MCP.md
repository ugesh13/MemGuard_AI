# MCP.md

**Status: optional stretch (P1). Not needed for the demo.** Do this only after F1 to F6 pass their tests. Never let it delay the core build.

## 1. What it is and why

Model Context Protocol (MCP) lets an AI assistant (for example Claude Desktop or Claude Code) call tools exposed by a server. A small **MemGuard MCP server** would let a security engineer ask an assistant "check this reply for protected text" or "summarize this garak report" inside their normal workflow.

It is an extra door into the same code. It adds no new analysis.

## 2. Proposed tools (keep to three)

| Tool | Input | Output | Maps to |
|------|-------|--------|---------|
| `parse_garak_report` | path to a local report.jsonl | the aggregated rows and Gap Map (no prompts, no outputs) | F1 `garak_parser.py` |
| `shield_check` | `text`, `shield_id` | action, masked text, reasons | F4 `shield.py` |
| `risk_from_components` | `M`, `E`, `P` | score, band | F3 `risk.py` |

Not exposed: anything that returns record text, loads user models, or starts audits. A long audit does not fit a short tool call, and exposing raw records to an assistant would weaken the privacy promise.

## 3. Security rules

- Local transport only (stdio). Do not expose over the internet in the MVP.
- Read only paths the user passes in, refuse paths outside an allowed folder.
- Return aggregates only. Never return prompt or output text from a garak report.
- No secrets in tool arguments. The Shield uses the salt from the environment, never from the tool call.
- Treat tool input as untrusted data. Assistants can be steered by text inside files; the server must not execute or follow instructions found in them.
- Log tool names and durations only, not arguments.

## 4. Build sketch (Python, about 30 minutes)

Use the official MCP Python SDK. Check the current SDK docs before coding; the API changes between versions. Typical shape:

```python
# apps/api/mcp_server.py  (verify against the SDK version you install)
from mcp.server.fastmcp import FastMCP
from app.services.garak_parser import parse_report
from app.services.risk import risk_from_components

mcp = FastMCP("memguard")

@mcp.tool()
def parse_garak_report(path: str) -> dict:
    """Aggregate a garak report. Returns pass rates and the MemGuard gap map."""
    return parse_report(path)  # must enforce allowed folder inside parse_report

@mcp.tool()
def risk_from_components(M: float, E: float, P: float) -> dict:
    """Compute the MemGuard risk score from three components in [0, 1]."""
    return risk_from_components_impl(M, E, P)

if __name__ == "__main__":
    mcp.run()  # stdio
```

Register it in the client's MCP config (location differs per client) with the command `python apps/api/mcp_server.py`.

## 5. How to demo it (only if built)

Ask the assistant: "Parse samples/garak.sample.report.jsonl and tell me which gaps MemGuard covers." Show that the answer contains only aggregates.

## 6. Tests

- Unit test each tool function directly.
- Test that a path outside the allowed folder is refused.
- Test that the garak parser output contains no `prompt` or `output` keys.

## 7. Honest positioning

Say: "We also expose a small MCP server so the checks can be used from an AI assistant." Do not say it replaces the UI, and do not imply the assistant can run full audits.
