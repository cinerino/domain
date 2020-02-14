/**
 * 通知ファクトリー
 */
import * as moment from 'moment';

import * as factory from '../../factory';

export const ABORT_REPORT_SUBJECT = 'Task aborted !!!';

export interface ILineNotifyMessage {
    subject: string;
    content: string;
}

export function task2lineNotify(params: {
    task: factory.task.ITask<any>;
}): ILineNotifyMessage {
    const task = params.task;

    const lastExecutionResult = (task.executionResults.length > 0) ? task.executionResults.slice(-1)[0] : undefined;
    let lastError = lastExecutionResult?.error;
    if (typeof lastError === 'string') {
        lastError = { message: lastError };
    }
    const lastMessage: string = `${String(lastError?.name)} ${String(lastError?.message)}`;
    const content: string = `project:${task.project?.id}
id:${task.id}
name:${task.name}
runsAt:${moment(task.runsAt)
            .toISOString()}
lastTriedAt:${moment(<Date>task.lastTriedAt)
            .toISOString()}
numberOfTried:${task.numberOfTried}
lastMessage:${lastMessage}`;

    return {
        subject: ABORT_REPORT_SUBJECT,
        content: content
    };
}
