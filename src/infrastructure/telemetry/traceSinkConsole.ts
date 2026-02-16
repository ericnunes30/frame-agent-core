import * as fs from 'node:fs';
import type { TraceEvent, TraceSink } from '@ericnunes/frame-agent-sdk';
import { formatTraceEventForTerminal, type TraceFormatOptions } from './traceEventFormatter';

export class ConsoleTraceSink implements TraceSink {
  private readonly opts: TraceFormatOptions;
  private readonly stdoutFd: number;

  constructor(opts?: TraceFormatOptions) {
    this.opts = opts ?? {};
    this.stdoutFd = process.stdout.fd;
  }

  emit(event: TraceEvent): void {
    const lines = formatTraceEventForTerminal(event, this.opts);
    for (const line of lines) {
      fs.writeSync(this.stdoutFd, line + '\n');
    }
  }
}
