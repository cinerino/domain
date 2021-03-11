/**
 * IAMサービス
 */
import { MongoRepository as MemberRepo } from '../repo/member';
import { MongoRepository as RoleRepo } from '../repo/role';

export type IPermission = string;

/**
 * プロジェクトメンバーの権限を検索する
 */
export function searchPermissions(params: {
    project: { id: string };
    member: { id: string };
}) {
    return async (repos: {
        member: MemberRepo;
        role: RoleRepo;
    }): Promise<{
        roleNames: string[];
        permissions: IPermission[];
    }> => {
        let permissions: IPermission[] = [];

        // プロジェクトメンバーを検索
        const projectMembers = await repos.member.search({
            project: { id: { $eq: params.project.id } },
            member: { id: { $eq: params.member.id } }
        });

        // 持っているロールを検索
        const roleNames = projectMembers.reduce<string[]>(
            (a, b) => [...a, ...(Array.isArray(b.member.hasRole)) ? b.member.hasRole.map((r) => r.roleName) : []],
            []
        );
        const roles = await repos.role.search({ roleName: { $in: roleNames } });

        // 権限をまとめる
        permissions = roles.reduce<string[]>(
            (a, b) => [...a, ...b.permissions],
            []
        );
        permissions = [...new Set(permissions)];

        return { roleNames, permissions };
    };
}
