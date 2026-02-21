import type Anthropic from "@anthropic-ai/sdk";

export const AI_TOOLS: Anthropic.Tool[] = [
  {
    name: "createStickyNote",
    description:
      "Create a sticky note on the board at the specified position with the given text and color.",
    input_schema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The text content of the sticky note.",
        },
        color: {
          type: "string",
          enum: ["yellow", "pink", "blue", "green", "purple", "orange"],
          description: "Background color of the sticky note.",
        },
        x: {
          type: "number",
          description: "X position on the board canvas.",
        },
        y: {
          type: "number",
          description: "Y position on the board canvas.",
        },
      },
      required: ["text"],
    },
  },

  {
    name: "createShape",
    description:
      "Create a geometric shape (rectangle, circle, or line) on the board.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["rectangle", "circle", "line"],
          description: "The kind of shape to create.",
        },
        color: {
          type: "string",
          description: "Fill color of the shape (CSS color string or hex).",
        },
        x: {
          type: "number",
          description: "X position on the board canvas.",
        },
        y: {
          type: "number",
          description: "Y position on the board canvas.",
        },
        width: {
          type: "number",
          description: "Width of the shape in pixels.",
        },
        height: {
          type: "number",
          description: "Height of the shape in pixels.",
        },
      },
      required: ["type"],
    },
  },

  {
    name: "createFrame",
    description:
      "Create a labeled frame (container/section) on the board. Useful for grouping related content or defining sections like 'Strengths', 'Action Items', etc.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "The label displayed on the frame.",
        },
        x: {
          type: "number",
          description: "X position on the board canvas.",
        },
        y: {
          type: "number",
          description: "Y position on the board canvas.",
        },
        width: {
          type: "number",
          description: "Width of the frame in pixels.",
        },
        height: {
          type: "number",
          description: "Height of the frame in pixels.",
        },
      },
      required: ["title"],
    },
  },

  {
    name: "createConnector",
    description:
      "Draw a connector (line or arrow) between two existing objects on the board.",
    input_schema: {
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
          type: "string",
          enum: ["line", "arrow"],
          description:
            "Visual style of the connector. Defaults to 'arrow'.",
        },
      },
      required: ["fromId", "toId"],
    },
  },

  {
    name: "moveObject",
    description: "Move an existing board object to a new position.",
    input_schema: {
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
    },
  },

  {
    name: "changeColor",
    description: "Change the fill color of an existing board object.",
    input_schema: {
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
    },
  },

  {
    name: "arrangeInGrid",
    description:
      "Arrange a set of existing objects into a uniform grid layout. Distributes them evenly in the specified number of columns, starting from the top-left of the current viewport.",
    input_schema: {
      type: "object",
      properties: {
        objectIds: {
          type: "array",
          items: { type: "string" },
          description: "IDs of the objects to arrange.",
        },
        columns: {
          type: "number",
          description:
            "Number of columns in the grid. Defaults to 3 if omitted.",
        },
      },
      required: ["objectIds"],
    },
  },

  {
    name: "resizeObject",
    description: "Resize an existing board object to new dimensions.",
    input_schema: {
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
    },
  },

  {
    name: "updateText",
    description:
      "Update the text content of an existing sticky note or text element.",
    input_schema: {
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
    },
  },

  {
    name: "getBoardState",
    description:
      "Retrieve the full list of objects currently on the board. Call this when you need IDs or details about objects not visible in the initial viewport context, or when you need to verify what already exists before making changes.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  {
    name: "createSWOTTemplate",
    description:
      "Create a complete SWOT analysis template: 4 frames arranged in a 2×2 grid (Strengths, Weaknesses, Opportunities, Threats). The server computes exact positions using the layout engine. Use this instead of calling createFrame 4 times.",
    input_schema: {
      type: "object",
      properties: {
        centerX: {
          type: "number",
          description: "X coordinate of the center of the 2×2 grid. Defaults to viewport center.",
        },
        centerY: {
          type: "number",
          description: "Y coordinate of the center of the 2×2 grid. Defaults to viewport center.",
        },
      },
      required: [],
    },
  },

  {
    name: "createJourneyMap",
    description:
      "Create a user journey map template: a horizontal row of labeled frames, one per stage, with arrows connecting them. The server computes exact positions using the layout engine.",
    input_schema: {
      type: "object",
      properties: {
        stages: {
          type: "array",
          items: { type: "string" },
          description: "Ordered list of stage names (e.g. ['Awareness', 'Consideration', 'Purchase', 'Loyalty']).",
        },
        centerX: {
          type: "number",
          description: "X coordinate of the center of the row. Defaults to viewport center.",
        },
        centerY: {
          type: "number",
          description: "Y coordinate of the center of the row. Defaults to viewport center.",
        },
      },
      required: ["stages"],
    },
  },

  {
    name: "createRetroTemplate",
    description:
      "Create a retrospective template: 3 frames in a horizontal layout (What Went Well, What Didn't, Action Items). The server computes exact positions using the layout engine.",
    input_schema: {
      type: "object",
      properties: {
        centerX: {
          type: "number",
          description: "X coordinate of the center of the 3-column layout. Defaults to viewport center.",
        },
        centerY: {
          type: "number",
          description: "Y coordinate of the center of the layout. Defaults to viewport center.",
        },
      },
      required: [],
    },
  },
];

export const SYSTEM_PROMPT = `You are an AI assistant that helps users manipulate a collaborative whiteboard. You receive the user's natural language command and the current state of objects visible in their viewport. When the user asks you to create, move, arrange, or modify board elements, use the provided tools.

For template commands, prefer the dedicated template tools:
- "SWOT analysis" → use createSWOTTemplate (creates 4 pre-positioned frames)
- "user journey map" or "journey map" → use createJourneyMap with stage names
- "retrospective" or "retro" → use createRetroTemplate (creates 3 pre-positioned frames)

For arranging existing objects, use arrangeInGrid — the server will fetch actual object sizes and compute optimal positions.

For other layout commands, plan the full layout first, then execute each creation/move as individual tool calls. Position new objects within the user's viewport bounds with at least 20px gaps. If active space reservations are listed, avoid placing objects in those areas. If you need more context about existing objects, use getBoardState first.`;
