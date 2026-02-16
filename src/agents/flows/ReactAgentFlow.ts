import {
  type GraphDefinition,
  type IGraphState,
  createReactValidationNode,
  createToolDetectionNode,
  createToolExecutorNode,
  GraphStatus,
} from '@ericnunes/frame-agent-sdk';

export const REACT_AGENT_FLOW: GraphDefinition = {
  entryPoint: 'agent',
  endNodeName: 'end',
  nodes: {
    agent: null as any,
    validate: createReactValidationNode(),
    detect: createToolDetectionNode(),
    execute: createToolExecutorNode(),
    end: async (state: IGraphState) => ({
      ...state,
      status: GraphStatus.FINISHED,
      shouldEnd: true,
    }),
  },
  edges: {
    agent: 'validate',
    validate: (state: IGraphState) => {
      const validationPassed = (state.metadata as any)?.validation?.passed !== false;
      return validationPassed ? 'detect' : 'agent';
    },
    detect: (state: IGraphState) => {
      const validationError = (state.metadata as any)?.validation?.error;
      if (validationError) return 'agent';

      const hasToolCall = !!state.lastToolCall;
      if (hasToolCall) {
        const toolName = state.lastToolCall?.toolName;
        if (toolName === 'final_answer' || toolName === 'ask_user') return 'end';
        return 'execute';
      }
      return 'end';
    },
    execute: (state: IGraphState) => {
      const toolName = state.lastToolCall?.toolName;
      if (toolName === 'final_answer' || toolName === 'ask_user') return 'end';
      return 'agent';
    },
    end: 'end',
  },
};

