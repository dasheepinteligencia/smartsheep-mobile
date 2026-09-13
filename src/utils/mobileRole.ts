// ============================================================================
// OMNI_SUPERVISOR_EXPERIENCE_V1
//
// Decide SOMENTE qual experiência visual o usuário recebe no mobile.
// Segurança e escopo continuam sendo responsabilidade do backend.
// ============================================================================

const safeParse = (value: any) => {
  if (!value) return {};

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch {
    return {};
  }
};

const normalizeRoleValue = (value: any) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

const toBool = (value: any) => {
  if (value === true || value === 1) {
    return true;
  }

  return [
    'TRUE',
    '1',
    'YES',
    'SIM'
  ].includes(
    normalizeRoleValue(value)
  );
};

export const isSupervisorMobileUser = (
  user: any
) => {
  if (!user) return false;

  const custom =
    safeParse(
      user?.custom_data ??
      user?.customData
    );

  const explicitExperience =
    normalizeRoleValue(
      custom?.mobile_experience ??
      custom?.mobileExperience ??
      user?.mobile_experience ??
      user?.mobileExperience
    );

  if (
    explicitExperience ===
    'SUPERVISOR'
  ) {
    return true;
  }

  if (
    toBool(
      custom?.mobile_supervisor ??
      custom?.mobileSupervisor
    )
  ) {
    return true;
  }

  const roleValues = [
    user?.roleName,
    user?.perfil,
    user?.cargo,
    user?.role?.name,
    user?.role?.level
  ]
    .map(normalizeRoleValue)
    .filter(Boolean);

  return roleValues.some(
    value =>
      value.includes('SUPERVISOR') ||
      value.includes('SUPERVISAO')
  );
};

export const getMobileProjectId = (
  user: any
) =>
  user?.allowed_project_ids?.[0] ||
  user?.allowedProjectIds?.[0] ||
  user?.projectId ||
  user?.project_id ||
  user?.projeto_id ||
  null;
