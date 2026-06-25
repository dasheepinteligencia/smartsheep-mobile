import { api } from './api';

const pickFirstFilled = (...values: any[]) => {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== '' &&
      String(value).trim() !== 'null' &&
      String(value).trim() !== 'undefined'
    ) {
      return value;
    }
  }

  return null;
};

const getProjectId = (user: any, visit: any) =>
  pickFirstFilled(
    user?.allowed_project_ids?.[0],
    user?.allowedProjectIds?.[0],
    user?.projectId,
    user?.project_id,
    user?.projeto_id,
    visit?.projectId,
    visit?.project_id
  );

const getRegistroVisitaId = (visit: any) =>
  pickFirstFilled(
    visit?.registroVisitaId,
    visit?.registro_visita_id,
    visit?.registroId,
    visit?.registro_id
  );

const getVisitaAgendadaId = (visit: any) =>
  pickFirstFilled(
    visit?.visitaAgendadaId,
    visit?.visita_agendada_id,
    visit?.visitaIdJson,
    visit?.visita_id_json,
    visit?.visitaId,
    visit?.visita_id,
    visit?.id
  );

export type RepeatableSurveyStatus = {
  repetivel: boolean;
  currentCount: number;
  min: number;
  max: number | null;
  blocked: boolean;
  labelSingular?: string;
  labelPlural?: string;
  projectId?: string;
  pesquisaId?: string;
  registroVisitaId?: string | null;
};

export const fetchRepeatableStatusForVisit = async (params: {
  user: any;
  visit: any;
  surveyId: any;
}): Promise<RepeatableSurveyStatus | null> => {
  const { user, visit, surveyId } = params;

  const projectId = getProjectId(user, visit);
  const pesquisaId = String(surveyId || '').trim();

  if (!projectId || !pesquisaId) return null;

  const query = new URLSearchParams();

  query.set('projectId', String(projectId));
  query.set('pesquisaId', pesquisaId);

  const registroVisitaId = getRegistroVisitaId(visit);
  const visitaAgendadaId = getVisitaAgendadaId(visit);

  if (registroVisitaId) query.set('registroVisitaId', String(registroVisitaId));
  if (visitaAgendadaId) query.set('visitaAgendadaId', String(visitaAgendadaId));
  if (visit?.id) query.set('visitaId', String(visit.id));
  if (visit?.loja_id || visit?.lojaId) query.set('lojaId', String(visit.loja_id || visit.lojaId));
  if (user?.id || visit?.usuario_id || visit?.usuarioId) query.set('usuarioId', String(user?.id || visit.usuario_id || visit.usuarioId));
  if (visit?.data_programada || visit?.dataProgramada) query.set('dataProgramada', String(visit.data_programada || visit.dataProgramada));

  const res = await api(`/coletas/repeatable-status?${query.toString()}`);

  if (!res.ok) return null;

  const data = await res.json();

  return {
    ...data,
    repetivel: data?.repetivel === true,
    currentCount: Number(data?.currentCount || 0),
    min: Number(data?.min || 1),
    max: data?.max === null || data?.max === undefined ? null : Number(data.max),
    blocked: data?.blocked === true || (data?.max && Number(data?.currentCount || 0) >= Number(data.max)),
  };
};

export const isRepeatableStatusBlocked = (status: RepeatableSurveyStatus | null | undefined) => {
  if (!status?.repetivel) return false;
  if (!status.max) return false;
  return Number(status.currentCount || 0) >= Number(status.max);
};

export const getRepeatableStatusSubtitle = (status: RepeatableSurveyStatus | null | undefined) => {
  if (!status?.repetivel || !status.max) return null;

  const label = Number(status.currentCount || 0) === 1
    ? status.labelSingular || 'registro'
    : status.labelPlural || 'registros';

  return `${status.currentCount}/${status.max} ${label}`;
};
