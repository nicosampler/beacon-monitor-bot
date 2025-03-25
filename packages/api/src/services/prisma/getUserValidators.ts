import { getPrisma } from '@/src/lib/prisma.js';

export type UserValidatorsResult = {
  id: string;
  username: string;
  inactiveOnMissedAttestations: number;
  validators: {
    withdrawalAddress: string;
    validators: {
      id: number;
      status: number | null;
    }[];
  }[];
};

export async function getUserValidators_db(
  loginId: string,
): Promise<UserValidatorsResult | undefined> {
  const prisma = getPrisma();

  const res = await prisma.$queryRaw<UserValidatorsResult[]>`
    WITH grouped_validators AS (
      SELECT 
        v."withdrawalAddress",
        jsonb_agg(
          jsonb_build_object(
            'id', v.id,
            'status', v.status
          )
        ) as validators
      FROM "User" u
      JOIN "_UserToValidator" uv ON u.id = uv."A"
      JOIN "Validator" v ON v.id = uv."B"
      WHERE u."loginId" = ${loginId}
      GROUP BY v."withdrawalAddress"
    )
    SELECT 
      u.id as id,
      u.username,
      u."inactiveOnMissedAttestations",
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'withdrawalAddress', gv."withdrawalAddress",
            'validators', gv.validators
          )
        ),
        '[]'::jsonb
      ) as validators
    FROM "User" u
    LEFT JOIN grouped_validators gv ON true
    WHERE u."loginId" = ${loginId}
    GROUP BY u.id, u.username, u."inactiveOnMissedAttestations"
  `;

  return res[0];
}
