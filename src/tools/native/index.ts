import {
  type ITool,
  FileReadTool,
  FileEditTool,
  FileCreateTool,
  TerminalTool,
  SearchTool,
  ToDoIstTool,
  SleepTool,
} from '@ericnunes/frame-agent-sdk';

export const fileReadTool: ITool = FileReadTool as unknown as ITool;
export const fileEditTool: ITool = FileEditTool as unknown as ITool;
export const fileCreateTool: ITool = FileCreateTool as unknown as ITool;
export const terminalTool: ITool = TerminalTool as unknown as ITool;
export const searchTool: ITool = SearchTool as unknown as ITool;
export const toDoIstTool: ITool = new ToDoIstTool();
export const sleepTool: ITool = SleepTool as unknown as ITool;

export { createListDirectoryTool } from './list-directory';
export { createReadImageTool } from './read-image';
export { createFileOutlineTool } from './file-outline';
export { createListCapabilitiesTool, createEnableCapabilityTool } from './capabilities';
