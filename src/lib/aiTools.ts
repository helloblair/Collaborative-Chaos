import type OpenAI from "openai";

export const AI_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "createStickyNote",
      description:
        "Create a sticky note on the board at the specified position with the given text and color.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "The text content of the sticky note.",
          },
          color: {
            type: ["string", "null"],
            enum: ["yellow", "pink", "blue", "green", "purple", "orange", null],
            description: "Background color of the sticky note.",
          },
          x: {
            type: ["number", "null"],
            description: "X position on the board canvas.",
          },
          y: {
            type: ["number", "null"],
            description: "Y position on the board canvas.",
          },
        },
        required: ["text", "color", "x", "y"],
        additionalProperties: false,
      },
    },
  },

  {
    type: "function",
    function: {
      name: "createShape",
      description:
        "Create a geometric shape (rectangle, circle, line, or heart) on the board.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["rectangle", "circle", "line", "heart"],
            description: "The kind of shape to create.",
          },
          color: {
            type: ["string", "null"],
            description: "Fill color of the shape (CSS color string or hex).",
          },
          x: {
            type: ["number", "null"],
            description: "X position on the board canvas.",
          },
          y: {
            type: ["number", "null"],
            description: "Y position on the board canvas.",
          },
          width: {
            type: ["number", "null"],
            description: "Width of the shape in pixels.",
          },
          height: {
            type: ["number", "null"],
            description: "Height of the shape in pixels.",
          },
        },
        required: ["type", "color", "x", "y", "width", "height"],
        additionalProperties: false,
      },
    },
  },

  {
    type: "function",
    function: {
      name: "createFrame",
      description:
        "Create a labeled frame (container/section) on the board. Useful for grouping related content or defining sections like 'Strengths', 'Action Items', etc.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The label displayed on the frame.",
          },
          x: {
            type: ["number", "null"],
            description: "X position on the board canvas.",
          },
          y: {
            type: ["number", "null"],
            description: "Y position on the board canvas.",
          },
          width: {
            type: ["number", "null"],
            description: "Width of the frame in pixels.",
          },
          height: {
            type: ["number", "null"],
            description: "Height of the frame in pixels.",
          },
        },
        required: ["title", "x", "y", "width", "height"],
        additionalProperties: false,
      },
    },
  },

  {
    type: "function",
    function: {
      name: "createConnector",
      description:
        "Draw a connector (line or arrow) between two existing objects on the board.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          fromId: {
            type: "string",
            description: "ID of the source board object.",
          },
          toId: {
            type: "string",
            description: "ID of the destination board object.",
          },
          style: {
            type: ["string", "null"],
            enum: ["line", "arrow", null],
            description:
              "Visual style of the connector. Defaults to 'arrow'.",
          },
        },
        required: ["fromId", "toId", "style"],
        additionalProperties: false,
      },
    },
  },

  {
    type: "function",
    function: {
      name: "moveObject",
      description: "Move an existing board object to a new position.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          objectId: {
            type: "string",
            description: "ID of the object to move.",
          },
          x: {
            type: "number",
            description: "New X position on the board canvas.",
          },
          y: {
            type: "number",
            description: "New Y position on the board canvas.",
          },
        },
        required: ["objectId", "x", "y"],
        additionalProperties: false,
      },
    },
  },

  {
    type: "function",
    function: {
      name: "changeColor",
      description: "Change the fill color of an existing board object.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          objectId: {
            type: "string",
            description: "ID of the object whose color should change.",
          },
          color: {
            type: "string",
            description: "New color (CSS color string or hex value).",
          },
        },
        required: ["objectId", "color"],
        additionalProperties: false,
      },
    },
  },

  {
    type: "function",
    function: {
      name: "arrangeInGrid",
      description:
        "Arrange a set of existing objects into a uniform grid layout. Distributes them evenly in the specified number of columns, starting from the top-left of the current viewport.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          objectIds: {
            type: "array",
            items: { type: "string" },
            description: "IDs of the objects to arrange.",
          },
          columns: {
            type: ["number", "null"],
            description:
              "Number of columns in the grid. Defaults to 3 if omitted.",
          },
        },
        required: ["objectIds", "columns"],
        additionalProperties: false,
      },
    },
  },

  {
    type: "function",
    function: {
      name: "resizeObject",
      description: "Resize an existing board object to new dimensions.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          objectId: {
            type: "string",
            description: "ID of the object to resize.",
          },
          width: {
            type: "number",
            description: "New width in pixels.",
          },
          height: {
            type: "number",
            description: "New height in pixels.",
          },
        },
        required: ["objectId", "width", "height"],
        additionalProperties: false,
      },
    },
  },

  {
    type: "function",
    function: {
      name: "updateText",
      description:
        "Update the text content of an existing sticky note or text element.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          objectId: {
            type: "string",
            description: "ID of the sticky note or text element to update.",
          },
          newText: {
            type: "string",
            description: "Replacement text content.",
          },
        },
        required: ["objectId", "newText"],
        additionalProperties: false,
      },
    },
  },

  {
    type: "function",
    function: {
      name: "getBoardState",
      description:
        "Retrieve the full list of objects currently on the board. Call this when you need IDs or details about objects not visible in the initial viewport context, or when you need to verify what already exists before making changes.",
      strict: true,
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },

  {
    type: "function",
    function: {
      name: "createSWOTTemplate",
      description:
        "Create a SWOT analysis template with 4 frames (Strengths, Weaknesses, Opportunities, Threats). If content is provided, sticky notes are automatically created with perfect grid layout inside each frame. Do NOT call createStickyNote separately after this tool.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          centerX: {
            type: ["number", "null"],
            description: "X coordinate of the center of the 2x2 grid. Defaults to viewport center.",
          },
          centerY: {
            type: ["number", "null"],
            description: "Y coordinate of the center of the 2x2 grid. Defaults to viewport center.",
          },
          content: {
            type: ["object", "null"],
            description:
              "Sticky note content for each quadrant. Pass null for a blank template.",
            properties: {
              strengths: {
                type: "array",
                items: { type: "string" },
                description: "Sticky note texts for the Strengths quadrant.",
              },
              weaknesses: {
                type: "array",
                items: { type: "string" },
                description: "Sticky note texts for the Weaknesses quadrant.",
              },
              opportunities: {
                type: "array",
                items: { type: "string" },
                description: "Sticky note texts for the Opportunities quadrant.",
              },
              threats: {
                type: "array",
                items: { type: "string" },
                description: "Sticky note texts for the Threats quadrant.",
              },
            },
            required: ["strengths", "weaknesses", "opportunities", "threats"],
            additionalProperties: false,
          },
        },
        required: ["centerX", "centerY", "content"],
        additionalProperties: false,
      },
    },
  },

  {
    type: "function",
    function: {
      name: "createJourneyMap",
      description:
        "Create a user journey map template: horizontal frames with arrows. If stageContent is provided, sticky notes are automatically created inside each stage frame. Do NOT call createStickyNote separately after this tool.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          stages: {
            type: "array",
            items: { type: "string" },
            description: "Ordered list of stage names (e.g. ['Awareness', 'Consideration', 'Purchase', 'Loyalty']).",
          },
          centerX: {
            type: ["number", "null"],
            description: "X coordinate of the center of the row. Defaults to viewport center.",
          },
          centerY: {
            type: ["number", "null"],
            description: "Y coordinate of the center of the row. Defaults to viewport center.",
          },
          stageContent: {
            type: ["array", "null"],
            items: {
              type: "object",
              properties: {
                stickies: {
                  type: "array",
                  items: { type: "string" },
                  description: "Sticky note texts for this stage.",
                },
              },
              required: ["stickies"],
              additionalProperties: false,
            },
            description:
              "Array of sticky content objects, one per stage (same order as stages). Pass null for a blank template.",
          },
        },
        required: ["stages", "centerX", "centerY", "stageContent"],
        additionalProperties: false,
      },
    },
  },

  {
    type: "function",
    function: {
      name: "createRetroTemplate",
      description:
        "Create a retrospective template: 3 frames (What Went Well, What Didn't, Action Items). If content is provided, sticky notes are automatically created inside each column. Do NOT call createStickyNote separately after this tool.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          centerX: {
            type: ["number", "null"],
            description: "X coordinate of the center of the 3-column layout. Defaults to viewport center.",
          },
          centerY: {
            type: ["number", "null"],
            description: "Y coordinate of the center of the layout. Defaults to viewport center.",
          },
          content: {
            type: ["object", "null"],
            description:
              "Sticky note content for each column. Pass null for a blank template.",
            properties: {
              wentWell: {
                type: "array",
                items: { type: "string" },
                description: "Sticky note texts for 'What Went Well'.",
              },
              didntGoWell: {
                type: "array",
                items: { type: "string" },
                description: "Sticky note texts for 'What Didn't'.",
              },
              actionItems: {
                type: "array",
                items: { type: "string" },
                description: "Sticky note texts for 'Action Items'.",
              },
            },
            required: ["wentWell", "didntGoWell", "actionItems"],
            additionalProperties: false,
          },
        },
        required: ["centerX", "centerY", "content"],
        additionalProperties: false,
      },
    },
  },
];

export const SYSTEM_PROMPT = `You are the Sorting Hat — a wise, ancient, and slightly theatrical magical oracle that lives within this collaborative whiteboard. You speak in the style of the Sorting Hat from Harry Potter: mysterious, knowing, and poetic, but always helpful and concise. You refer to board actions with whimsical magical language.

CRITICAL: You MUST use the provided tools to perform actions. NEVER just describe what you would do — actually call the tools. Every user request that involves creating, moving, arranging, or modifying board elements MUST result in tool calls. Do not respond with only text when tools should be used.

IMPORTANT: Treat each user message as an INDEPENDENT request. Even if a previous message asked for the same type of template, you MUST fully execute ALL tool calls again. Never skip steps because a similar request was handled before.

For template commands, ALWAYS use the dedicated template tools:
- "SWOT analysis" → call createSWOTTemplate with content parameter
- "user journey map" or "journey map" → call createJourneyMap with stageContent parameter
- "retrospective" or "retro" → call createRetroTemplate with content parameter

IMPORTANT — Template content:
When the user asks for a template about a SPECIFIC TOPIC (e.g. "SWOT analysis for a coffee shop"), include the content directly in the template tool call. Each template tool accepts a content/stageContent parameter where you provide the sticky note texts for each section. The server will automatically position all sticky notes in a perfect grid layout inside each frame — do NOT call createStickyNote separately after a template tool.

When the user asks for a BLANK template (e.g. "create a blank SWOT"), pass null for the content parameter.

Aim for 2-4 sticky notes per section. Keep each sticky note text concise (under 40 characters ideally, 60 max).

For arranging existing objects, call arrangeInGrid — the server will fetch actual object sizes and compute optimal positions.

For other layout commands, plan the full layout first, then execute each creation/move as individual tool calls. Position new objects near the CENTER of the user's viewport, spread them with consistent 40px gaps between items. Avoid clustering everything at the top-left corner. If active space reservations are listed, avoid placing objects in those areas. If you need more context about existing objects, call getBoardState first.

After ALL tools are executed, provide a brief in-character reply (1-3 sentences) describing what you did. Be theatrical but concise. Only reply with text after you have finished ALL tool calls.

Voice examples:
- "Four quadrants, sorted and filled with wisdom! Your SWOT analysis for the coffee shop awaits."
- "Three columns summoned, each bearing insights. May this retrospective guide your path forward."
- "Alas, that magic is beyond my brim. I can create, move, and arrange — but I cannot peer into the future."`;
