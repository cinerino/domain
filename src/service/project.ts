/**
 * プロジェクトサービス
 */
import { MongoRepository as ActionRepo } from '../repo/action';
import { MongoRepository as MemberRepo } from '../repo/member';
import { MongoRepository as TaskRepo } from '../repo/task';
import { MongoRepository as TransactionRepo } from '../repo/transaction';

export function deleteProject(params: { id: string }) {
    return async (repos: {
        action: ActionRepo;
        member: MemberRepo;
        task: TaskRepo;
        transaction: TransactionRepo;
    }): Promise<void> => {
        // プロジェクトに所属する全データをリポジトリから削除する
        await repos.action.actionModel.deleteMany({
            'project.id': { $exists: true, $eq: params.id }
        })
            .exec();
        await repos.task.taskModel.deleteMany({
            'project.id': { $exists: true, $eq: params.id }
        })
            .exec();
        await repos.transaction.transactionModel.deleteMany({
            'project.id': { $exists: true, $eq: params.id }
        })
            .exec();

        await repos.member.memberModel.deleteMany({
            'project.id': { $exists: true, $eq: params.id }
        })
            .exec();
    };
}
