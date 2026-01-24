import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { IRespWithData } from "../types/app-types.js";



export function sendResponse(c: Context, status: ContentfulStatusCode, message: string, data?: unknown) {
  const respData: IRespWithData = {
    status,
    success: true,
    message,
    data: data ?? null,
  };
  return c.json(respData, status);
}

export function sendToonResponse(c: Context, status: ContentfulStatusCode, message: string, data?: unknown) {
  const toonResponse = `status: ${status}
success: true
message: "${message}"

data:
${objectToToon(data ?? {}, 1)}`;

  return c.text(toonResponse.trim(), status, {
    "Content-Type": "application/toon"
  });
}
function objectToToon(obj: any, indentLevel: number = 0): string {
  const indent = (level: number) => "  ".repeat(level);

  if (obj === null || obj === undefined) {
    return `${indent(indentLevel)}""\n`;
  }

  if (typeof obj !== "object") {
    return `${indent(indentLevel)}${formatPrimitive(obj)}\n`;
  }

  if (Array.isArray(obj)) {
    // If array contains objects, render each element as a nested block with a dash.
    const hasObject = obj.some(v => v && typeof v === "object" && !Array.isArray(v));
    if (hasObject) {
      return obj.map(v => {
        if (v === null || v === undefined) return `${indent(indentLevel)}- ""\n`;
        if (typeof v === "object" && !Array.isArray(v)) {
          return `${indent(indentLevel)}-\n` + objectToToon(v, indentLevel + 1);
        }
        return `${indent(indentLevel)}- ${formatPrimitive(v)}\n`;
      }).join("");
    }

    const arr = obj.map(v => (typeof v === "string" ? `"${v}"` : formatPrimitive(v))).join(", ");
    return `${indent(indentLevel)}[${arr}]\n`;
  }

  let out = "";
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      out += `${indent(indentLevel)}${key}: ""\n`;
    } else if (Array.isArray(value)) {
      const hasObject = value.some(v => v && typeof v === "object" && !Array.isArray(v));
      if (hasObject) {
        out += `${indent(indentLevel)}${key}:\n`;
        out += value.map(v => {
          if (v === null || v === undefined) return `${indent(indentLevel + 1)}- ""\n`;
          if (typeof v === "object" && !Array.isArray(v)) {
            return `${indent(indentLevel + 1)}-\n` + objectToToon(v, indentLevel + 2);
          }
          return `${indent(indentLevel + 1)}- ${formatPrimitive(v)}\n`;
        }).join("");
      } else {
        const arr = value.map(v => (typeof v === "string" ? `"${v}"` : formatPrimitive(v))).join(", ");
        out += `${indent(indentLevel)}${key}: [${arr}]\n`;
      }
    } else if (typeof value === "object") {
      out += `${indent(indentLevel)}${key}:\n`;
      out += objectToToon(value, indentLevel + 1);
    } else {
      out += `${indent(indentLevel)}${key}: ${formatPrimitive(value)}\n`;
    }
  }

  return out;
}

function formatPrimitive(val: any): string {
  if (typeof val === "string") return `"${val}"`;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  return `""`;
}
