export type SurveyMatchConfig = {
  enabled: boolean;
  mode: 'SOMENTE_MATCHES' | 'VALIDAR_MATCH' | '';
  combine: 'UNIAO' | 'INTERSECAO';
  behavior: 'AVISO' | 'SEM_AVISO' | 'BLOQUEAR';
  sourceRef: string;
  message: string;
};

const normalize = (value: any) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const asArray = (value: any): any[] => {
  if (value === null || value === undefined || value === '') return [];
  return Array.isArray(value) ? value : [value];
};

const filterObject = (question: any) =>
  question?.filtros_produto ||
  question?.filtroProduto ||
  question?.filtro_produto ||
  {};

export const getSurveyMatchConfig = (question: any): SurveyMatchConfig => {
  const filters = filterObject(question);
  const sourceRef = String(filters?.matchPerguntaRef || filters?.match_pergunta_ref || '').trim();
  const rawMode = String(filters?.matchModo || filters?.match_modo || '').trim().toUpperCase();
  const [baseMode, combineMode] = rawMode.split('|').map((part) => String(part || '').trim().toUpperCase());

  const mode =
    baseMode === 'SOMENTE_MATCHES' || baseMode === 'VALIDAR_MATCH'
      ? baseMode
      : '';

  const combine = combineMode === 'INTERSECAO' ? 'INTERSECAO' : 'UNIAO';
  const rawBehavior = String(filters?.matchComportamento || filters?.match_comportamento || 'AVISO').trim().toUpperCase();
  const behavior =
    rawBehavior === 'BLOQUEAR' || rawBehavior === 'SEM_AVISO'
      ? rawBehavior
      : 'AVISO';

  return {
    enabled: Boolean(sourceRef && mode),
    mode,
    combine,
    behavior,
    sourceRef,
    message: String(filters?.matchMensagem || filters?.match_mensagem || '').trim(),
  };
};

export const isSurveyGroupQuestion = (question: any) => {
  let validation = question?.validacao || question?.validacoes || {};
  if (typeof validation === 'string') {
    try { validation = JSON.parse(validation); } catch { validation = {}; }
  }
  const type = String(question?.tipo || '').trim().toUpperCase();
  return (
    type === 'GRUPO' ||
    type === 'SECAO' ||
    question?.isGrupoReal === true ||
    question?.is_grupo === true ||
    validation?.isGrupo === true ||
    validation?.is_grupo === true ||
    String(validation?.isGrupo || '').toLowerCase() === 'true' ||
    String(validation?.is_grupo || '').toLowerCase() === 'true'
  );
};

const sortSurveyItemsByOrder = (items: any[]): any[] => {
  return items
    .map((item, index) => {
      const rawOrder =
        item?.ordem ??
        item?.order ??
        item?.position ??
        item?.posicao;

      const numericOrder = Number(rawOrder);

      return {
        item,
        index,
        order:
          rawOrder !== undefined &&
          rawOrder !== null &&
          rawOrder !== '' &&
          Number.isFinite(numericOrder)
            ? numericOrder
            : null,
      };
    })
    .sort((a, b) => {
      // O web usa `ordem` como ordem canônica das perguntas.
      // Quando os dois itens possuem ordem explícita, respeitamos esse valor.
      // Se algum item antigo não tiver ordem, preservamos a sequência recebida.
      if (a.order !== null && b.order !== null && a.order !== b.order) {
        return a.order - b.order;
      }

      return a.index - b.index;
    })
    .map(({ item }) => item);
};

// Aceita tanto o formato plano do web (marcador de grupo + perguntas)
// quanto payloads aninhados (grupo.perguntas), sem descartar o cabeçalho.
// Em ambos os formatos, respeita `ordem`, que é a mesma referência usada
// pelo web para posicionar perguntas dentro do formulário.
export const flattenSurveyQuestionsPreservingGroups = (input: any): any[] => {
  const source = Array.isArray(input) ? input : [];
  const result: any[] = [];

  const visit = (item: any) => {
    if (!item || typeof item !== 'object') return;

    const children =
      Array.isArray(item.perguntas)
        ? item.perguntas
        : Array.isArray(item.questoes)
          ? item.questoes
          : Array.isArray(item.questions)
            ? item.questions
            : null;

    const isGroup = isSurveyGroupQuestion(item);
    const looksLikeSurveyContainer = Boolean(children) && !isGroup && !item.tipo && !item.texto && !item.pergunta;

    if (isGroup) {
      const copy = { ...item };
      delete copy.perguntas;
      delete copy.questoes;
      delete copy.questions;
      result.push(copy);
      if (children) sortSurveyItemsByOrder(children).forEach(visit);
      return;
    }

    if (looksLikeSurveyContainer) {
      sortSurveyItemsByOrder(children!).forEach(visit);
      return;
    }

    result.push(item);

    // Alguns payloads antigos trazem uma pergunta/grupo com filhos.
    if (children) sortSurveyItemsByOrder(children).forEach(visit);
  };

  sortSurveyItemsByOrder(source).forEach(visit);
  return result;
};

const findQuestionByRef = (questions: any[], sourceRef: string) => {
  const ref = normalize(sourceRef);
  if (!ref) return null;

  return (
    questions.find((question) =>
      [
        question?.id,
        question?.codigo_referencia,
        question?.codigoReferencia,
        question?.ref,
      ].some((candidate) => normalize(candidate) === ref)
    ) || null
  );
};

const productCandidates = (product: any) => [
  product?.id,
  product?.nome,
  product?.name,
  product?.descricao,
  product?.description,
  product?.sku,
  product?.ean,
].map(normalize).filter(Boolean);

const resolveProductIdsFromAnswer = (answer: any, products: any[]): string[] => {
  const ids = new Set<string>();

  asArray(answer).forEach((rawValue) => {
    const value = normalize(rawValue);
    if (!value) return;

    const product = products.find((candidate) =>
      productCandidates(candidate).includes(value)
    );

    const id = String(product?.id || '').trim();
    if (id) ids.add(id);
  });

  return Array.from(ids);
};

export const questionUsesProductDynamicSource = (question: any): boolean => {
  const directSource = String(
    question?.origem_dados_dinamica ||
    question?.origemDadosDinamica ||
    question?.dynamicSource ||
    question?.dynamic_source ||
    ''
  ).trim().toUpperCase();

  if (directSource === 'PRODUTOS') return true;

  const options = Array.isArray(question?.opcoes)
    ? question.opcoes
    : Array.isArray(question?.options)
      ? question.options
      : [];

  return options.some((option: any) =>
    String(option || '').trim().toUpperCase() === '@DYNAMIC_SOURCE:PRODUTOS'
  );
};

export const resolveSingleSurveyProductIdFromAnswer = (
  question: any,
  answer: any,
  products: any[]
): string | null => {
  if (!questionUsesProductDynamicSource(question)) return null;

  const ids = resolveProductIdsFromAnswer(answer, products);

  return ids.length === 1
    ? ids[0]
    : null;
};

const targetIdsForSource = (sourceProduct: any) => {
  const ids = new Set<string>();
  const rows = Array.isArray(sourceProduct?.matchesAsSource)
    ? sourceProduct.matchesAsSource
    : Array.isArray(sourceProduct?.matches_as_source)
      ? sourceProduct.matches_as_source
      : [];

  rows.forEach((row: any) => {
    if (row?.active === false) return;
    const targetId = String(
      row?.targetProductId ||
      row?.target_product_id ||
      row?.targetProduct?.id ||
      row?.target?.id ||
      ''
    ).trim();
    if (targetId) ids.add(targetId);
  });

  return ids;
};

export const getAllowedSurveyMatchTargetIds = (
  question: any,
  questions: any[],
  answers: Record<string, any>,
  products: any[]
) => {
  const config = getSurveyMatchConfig(question);
  if (!config.enabled) {
    return { config, sourceAnswered: false, allowedIds: null as Set<string> | null };
  }

  const sourceQuestion = findQuestionByRef(questions, config.sourceRef);
  if (!sourceQuestion) {
    return { config, sourceAnswered: false, allowedIds: new Set<string>() };
  }

  const sourceAnswer = answers[String(sourceQuestion.id)] ?? answers[config.sourceRef];
  const sourceIds = resolveProductIdsFromAnswer(sourceAnswer, products);

  if (sourceIds.length === 0) {
    return { config, sourceAnswered: false, allowedIds: new Set<string>() };
  }

  const sets = sourceIds.map((sourceId) => {
    const sourceProduct = products.find((product) => String(product?.id) === String(sourceId));
    return targetIdsForSource(sourceProduct);
  });

  let allowedIds = new Set<string>();

  if (config.combine === 'INTERSECAO') {
    if (sets.length > 0) {
      allowedIds = new Set(sets[0]);
      for (const set of sets.slice(1)) {
        allowedIds = new Set(Array.from(allowedIds).filter((id) => set.has(id)));
      }
    }
  } else {
    sets.forEach((set) => set.forEach((id) => allowedIds.add(id)));
  }

  return { config, sourceAnswered: true, allowedIds };
};

export const shouldShowProductBySurveyMatch = (
  question: any,
  product: any,
  questions: any[],
  answers: Record<string, any>,
  products: any[]
) => {
  const state = getAllowedSurveyMatchTargetIds(question, questions, answers, products);
  if (!state.config.enabled || state.config.mode !== 'SOMENTE_MATCHES') return true;
  if (!state.sourceAnswered || !state.allowedIds) return false;
  return state.allowedIds.has(String(product?.id || ''));
};

export const evaluateSurveyMatchAnswer = (
  question: any,
  answer: any,
  questions: any[],
  answers: Record<string, any>,
  products: any[]
) => {
  const state = getAllowedSurveyMatchTargetIds(question, questions, answers, products);
  const values = asArray(answer).filter((value) => String(value ?? '').trim() !== '');

  if (!state.config.enabled || values.length === 0) {
    return { ...state, valid: true, invalidValues: [] as any[] };
  }

  // Enquanto a pergunta-base ainda não foi respondida, a validação de obrigatoriedade/ordem
  // do próprio formulário decide o fluxo. Não inventamos um bloqueio adicional aqui.
  if (!state.sourceAnswered || !state.allowedIds) {
    return { ...state, valid: true, invalidValues: [] as any[] };
  }

  // Sem nenhum Match cadastrado para o produto-base não existe regra objetiva
  // contra a qual validar a resposta. Igual ao comportamento esperado no web,
  // isso pode ser informado inline, mas NUNCA gera popup/bloqueio de Match ao salvar.
  if (state.allowedIds.size === 0) {
    return {
      ...state,
      valid: true,
      invalidValues: [] as any[],
      noMapping: true,
    };
  }

  const invalidValues = values.filter((value) => {
    const ids = resolveProductIdsFromAnswer(value, products);
    return ids.length === 0 || ids.some((id) => !state.allowedIds!.has(id));
  });

  return {
    ...state,
    valid: invalidValues.length === 0,
    invalidValues,
  };
};

export type SurveyMatchInlineState = {
  config: SurveyMatchConfig;
  kind: 'none' | 'info' | 'warning' | 'error';
  reason: 'WAIT_SOURCE' | 'NO_MAPPING' | 'INVALID' | '';
  invalidValues: any[];
};

export const getSurveyMatchInlineState = (
  question: any,
  answer: any,
  questions: any[],
  answers: Record<string, any>,
  products: any[]
): SurveyMatchInlineState => {
  const config = getSurveyMatchConfig(question);

  const none = (): SurveyMatchInlineState => ({
    config,
    kind: 'none',
    reason: '',
    invalidValues: [],
  });

  if (!config.enabled) return none();

  const sourceQuestion = findQuestionByRef(questions, config.sourceRef);
  if (!sourceQuestion) {
    return {
      config,
      kind: 'info',
      reason: 'WAIT_SOURCE',
      invalidValues: [],
    };
  }

  const sourceAnswer = answers[String(sourceQuestion.id)] ?? answers[config.sourceRef];
  const sourceIds = resolveProductIdsFromAnswer(sourceAnswer, products);

  if (sourceIds.length === 0) {
    return {
      config,
      kind: 'info',
      reason: 'WAIT_SOURCE',
      invalidValues: [],
    };
  }

  const state = getAllowedSurveyMatchTargetIds(question, questions, answers, products);
  const shouldBlock = config.mode === 'SOMENTE_MATCHES' || config.behavior === 'BLOQUEAR';

  if (state.allowedIds && state.allowedIds.size === 0) {
    return {
      config,
      // Ausência de cadastro de Match é informativa para o promotor;
      // não é um erro da resposta e não deve induzir bloqueio visual.
      kind: 'warning',
      reason: 'NO_MAPPING',
      invalidValues: [],
    };
  }

  const values = asArray(answer).filter((value) => String(value ?? '').trim() !== '');
  if (values.length === 0) return none();

  const invalidValues = values.filter((value) => {
    const ids = resolveProductIdsFromAnswer(value, products);
    return ids.length === 0 || ids.some((id) => !state.allowedIds?.has(id));
  });

  if (invalidValues.length === 0) return none();

  return {
    config,
    kind: shouldBlock ? 'error' : 'warning',
    reason: 'INVALID',
    invalidValues,
  };
};
