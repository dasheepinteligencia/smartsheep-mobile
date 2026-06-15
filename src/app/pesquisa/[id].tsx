import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  TextInput, Alert, Image, ActivityIndicator, StatusBar,
  KeyboardAvoidingView, Platform, Modal
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { 
    ArrowLeft, Camera, Save, X, Package, FolderOpen, ChevronDown, ChevronRight, Asterisk, Check, AlertTriangle, CheckCircle2, XCircle
} from 'lucide-react-native';

import { useSettingsStore } from '../../store/useSettingsStore';
import { useAuthStore } from '../../store/useAuthStore';
import { getDBConnection } from '../../database/db';
import { addToSyncQueue } from '../../services/syncService';
import { t } from '../../utils/i18n';

const normalizar = (val: any) => String(val || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const safeParseArray = (data: any) => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (typeof data === 'string') {
        try { const parsed = JSON.parse(data); return Array.isArray(parsed) ? parsed : []; } catch (e) { return []; }
    }
    return [];
};


const safeParseObject = (data: any) => {
    if (!data) return {};
    if (typeof data === 'object' && !Array.isArray(data)) return data;
    if (typeof data === 'string') {
        try {
            const parsed = JSON.parse(data);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (e) {
            return {};
        }
    }
    return {};
};

const isTruthy = (value: any) => {
    const normalized = String(value ?? '').trim().toLowerCase();
    return value === true || value === 1 || normalized === '1' || normalized === 'true' || normalized === 'sim' || normalized === 'yes';
};

const isDynamicProductOption = (value: any) => {
    const normalized = String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();

    return normalized.includes('DYNAMIC_SOURCE') && normalized.includes('PRODUT');
};

const isDynamicCatalogOption = (value: any) => {
    const normalized = String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();

    return normalized.includes('DYNAMIC_SOURCE') && (
        normalized.includes('PRODUT') ||
        normalized.includes('CATEG') ||
        normalized.includes('SUBCATEG') ||
        normalized.includes('MARCA') ||
        normalized.includes('BRAND')
    );
};

const normalizeOptionSortText = (value: any) =>
    String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

const sortOptionObjectsAlphabetically = <T extends { label?: any; value?: any }>(options: T[]) =>
    [...options].sort((a, b) =>
        normalizeOptionSortText(a.label || a.value).localeCompare(
            normalizeOptionSortText(b.label || b.value),
            'pt-BR',
            { numeric: true, sensitivity: 'base' }
        )
    );

const shouldSortChoiceOptions = (rawOptions: any[], productOptions: any[], optionObjects: any[], tipo?: any) => {
    const normalizedType = String(tipo || '').toUpperCase();
    const isCatalogType = ['PRODUTO', 'PRODUCT', 'CATEGORIA', 'CATEGORY', 'SUBCATEGORIA', 'SUBCATEGORY', 'MARCA', 'BRAND'].includes(normalizedType);
    const hasDynamicCatalog = rawOptions.some(isDynamicCatalogOption);

    return isCatalogType || hasDynamicCatalog || productOptions.length > 0 || optionObjects.length > 8;
};

const parseOptionsForMobile = (value: any) => {
    if (!value) return [];

    if (Array.isArray(value)) {
        return value.map((item) => String(item || '').trim()).filter(Boolean);
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];

        if (isDynamicProductOption(trimmed)) return [trimmed];

        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            return trimmed
                .substring(1, trimmed.length - 1)
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean);
        }

        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return parsed.map((item) => String(item || '').trim()).filter(Boolean);
            }
        } catch {}

        return trimmed
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }

    return [];
};

const pickFirstFilled = (...values: any[]) => {
    for (const value of values) {
        if (value !== undefined && value !== null && String(value).trim() !== '' && String(value).trim() !== 'null' && String(value).trim() !== 'undefined') {
            return value;
        }
    }
    return null;
};

const getProjectId = (user: any, visita: any) =>
    pickFirstFilled(user?.allowed_project_ids?.[0], user?.allowedProjectIds?.[0], user?.projectId, user?.project_id, user?.projeto_id, visita?.project_id, visita?.projectId, 'geral');

const getSurveyIdFromVisitPayload = (visita: any, pesquisasRaw: any[]) => {
    const firstSurvey = pesquisasRaw?.[0] || {};

    // Para pesquisa de visita, pesquisa_json pode vir como lista de PERGUNTAS.
    // Nesse caso firstSurvey.id é o ID da pergunta, não da pesquisa.
    // A rota /coletas exige data.pesquisa_id com o ID real da tabela pesquisa.
    return pickFirstFilled(
        visita?.pesquisa_id,
        visita?.pesquisaId,
        visita?.pesquisa_id_real,
        firstSurvey?.pesquisaId,
        firstSurvey?.pesquisa_id,
        firstSurvey?.surveyId,
        firstSurvey?.survey_id,
        firstSurvey?.formularioId,
        firstSurvey?.formulario_id,
        firstSurvey?.pesquisa?.id,
        firstSurvey?.survey?.id
    );
};

const getSurveyTitleFromVisitPayload = (visita: any, pesquisasRaw: any[]) => {
    const firstSurvey = pesquisasRaw?.[0] || {};

    return pickFirstFilled(
        visita?.pesquisa_titulo,
        visita?.pesquisaTitulo,
        visita?.pesquisa_titulo_real,
        firstSurvey?.pesquisaTitulo,
        firstSurvey?.pesquisa_titulo,
        firstSurvey?.surveyTitle,
        firstSurvey?.survey_title,
        firstSurvey?.formularioTitulo,
        firstSurvey?.formulario_titulo,
        firstSurvey?.pesquisa?.titulo,
        firstSurvey?.survey?.titulo,
        'Pesquisa de Loja'
    );
};

const getSurveyIdFromSurveyItem = (item: any) =>
    pickFirstFilled(
        item?.id,
        item?.pesquisaId,
        item?.pesquisa_id,
        item?.surveyId,
        item?.survey_id,
        item?.formularioId,
        item?.formulario_id,
        item?.pesquisa?.id,
        item?.survey?.id
    );

const getSurveyTitleFromSurveyItem = (item: any) =>
    pickFirstFilled(
        item?.titulo,
        item?.nome,
        item?.pesquisaTitulo,
        item?.pesquisa_titulo,
        item?.surveyTitle,
        item?.survey_title,
        item?.formularioTitulo,
        item?.formulario_titulo,
        item?.pesquisa?.titulo,
        item?.survey?.titulo,
        'Pesquisa de Loja'
    );

const getQuestionSurveyId = (question: any) =>
    pickFirstFilled(
        question?.pesquisaId,
        question?.pesquisa_id,
        question?.surveyId,
        question?.survey_id,
        question?.formularioId,
        question?.formulario_id,
        question?.pesquisa?.id,
        question?.survey?.id
    );

const getVisitIdentifierCandidatesForSurvey = (visit: any) => {
    const candidates = [
        visit?.id,
        visit?.visitaAgendadaId,
        visit?.visita_agendada_id,
        visit?.visitaIdJson,
        visit?.visita_id_json,
        visit?.registroVisitaId,
        visit?.registro_visita_id,
        visit?.registroId,
        visit?.registro_id,
    ];

    return Array.from(new Set(
        candidates
            .map((value) => String(value ?? '').trim())
            .filter((value) => value && value !== 'null' && value !== 'undefined')
    ));
};

const hasExplicitSurveyCompletionState = (survey: any) => (
    survey && (
        survey.concluida !== undefined ||
        survey.concluido !== undefined ||
        survey.completed !== undefined ||
        survey.realizada !== undefined ||
        survey.respondida !== undefined ||
        survey.respondidaOnline !== undefined ||
        survey.hasColeta !== undefined ||
        survey.has_collection !== undefined ||
        survey.statusOnline !== undefined ||
        survey.coletaId !== undefined ||
        survey.coleta_id !== undefined
    )
);

const getSurveyCompletedFlag = (survey: any) => isTruthy(
    pickFirstFilled(
        survey?.concluida,
        survey?.concluido,
        survey?.completed,
        survey?.realizada,
        survey?.respondida,
        survey?.respondidaOnline,
        survey?.hasColeta,
        survey?.has_collection
    )
);

const getSurveyServerStateUpdatedAt = (survey: any, visit: any) => pickFirstFilled(
    survey?.serverStateUpdatedAt,
    survey?.server_state_updated_at,
    survey?.coletaUpdatedAt,
    survey?.coleta_updated_at,
    survey?.updated_at,
    survey?.updatedAt,
    visit?.coletas_sync_updated_at,
    visit?.coletasSyncUpdatedAt,
    visit?.updated_at,
    visit?.updatedAt
);

const toTimestamp = (value: any) => {
    if (!value) return 0;
    const ts = new Date(value).getTime();
    return Number.isFinite(ts) ? ts : 0;
};

const getLocalCollectionTimestamp = (row: any) => {
    const raw = safeParseObject(row?.raw_json);
    return toTimestamp(pickFirstFilled(row?.data_fim, row?.data_inicio, row?.updated_at, row?.updatedAt, raw?.data_fim, raw?.data_inicio, raw?.updated_at, raw?.updatedAt));
};

const checkPendingLocalCollectionIsNewer = async (db: any, visit: any, surveyId: any, serverStateUpdatedAt: any) => {
    try {
        const exists = await db.getAllAsync(`SELECT name FROM sqlite_master WHERE type='table' AND name='coletas'`);
        if (!exists?.length) return false;

        const visitIds = getVisitIdentifierCandidatesForSurvey(visit);
        if (visitIds.length === 0 || !surveyId) return false;

        const placeholders = visitIds.map(() => '?').join(',');
        const rows = await db.getAllAsync(
            `SELECT pesquisa_id, visita_id, data_inicio, data_fim, raw_json, pending_sync FROM coletas WHERE pesquisa_id = ? AND visita_id IN (${placeholders}) AND COALESCE(pending_sync, 0) = 1`,
            [String(surveyId), ...visitIds]
        );

        const serverTs = toTimestamp(serverStateUpdatedAt);

        return (rows || []).some((row: any) => {
            const localTs = getLocalCollectionTimestamp(row);
            return serverTs === 0 || localTs > serverTs;
        });
    } catch {
        return false;
    }
};

const clearStaleLocalSurveyData = async (db: any, visit: any, surveyId: any, serverStateUpdatedAt: any) => {
    try {
        const exists = await db.getAllAsync(`SELECT name FROM sqlite_master WHERE type='table' AND name='coletas'`);
        if (!exists?.length || !surveyId) return;

        const visitIds = getVisitIdentifierCandidatesForSurvey(visit);
        if (visitIds.length === 0) return;

        const placeholders = visitIds.map(() => '?').join(',');
        const rows = await db.getAllAsync(
            `SELECT id, data_inicio, data_fim, raw_json, pending_sync FROM coletas WHERE pesquisa_id = ? AND visita_id IN (${placeholders})`,
            [String(surveyId), ...visitIds]
        );

        const serverTs = toTimestamp(serverStateUpdatedAt);
        const staleIds = (rows || [])
            .filter((row: any) => {
                if (Number(row?.pending_sync || 0) !== 1) return true;
                const localTs = getLocalCollectionTimestamp(row);
                return serverTs > 0 && localTs <= serverTs;
            })
            .map((row: any) => row.id)
            .filter(Boolean);

        for (const staleId of staleIds) {
            await db.runAsync(`DELETE FROM coletas WHERE id = ?`, [String(staleId)]).catch(() => {});
        }
    } catch {}
};

const normalizeVisitSurveyPayload = (visita: any, rawPayload: any[], requestedSurveyId?: any) => {
    const requested = String(requestedSurveyId || '').trim();

    if (!Array.isArray(rawPayload) || rawPayload.length === 0) {
        return {
            selectedSurveyId: pickFirstFilled(visita?.pesquisa_id, visita?.pesquisaId),
            selectedSurveyTitle: pickFirstFilled(visita?.pesquisa_titulo, visita?.pesquisaTitulo, 'Pesquisa de Loja'),
            selectedSurveyRaw: {},
            selectedSurveyHasExplicitState: false,
            selectedSurveyCompleted: false,
            selectedSurveyServerStateUpdatedAt: getSurveyServerStateUpdatedAt({}, visita),
            questions: [],
            availableSurveys: [],
        };
    }

    const isNewSurveyListFormat = rawPayload.some((item: any) =>
        Array.isArray(item?.perguntas) ||
        Array.isArray(item?.questoes) ||
        Array.isArray(item?.questions)
    );

    if (isNewSurveyListFormat) {
        const availableSurveys = rawPayload.map((survey: any) => {
            const surveyId = String(getSurveyIdFromSurveyItem(survey) || '');
            const questions = survey?.perguntas || survey?.questoes || survey?.questions || [];

            return {
                id: surveyId,
                titulo: getSurveyTitleFromSurveyItem(survey),
                questions: Array.isArray(questions) ? questions : [],
                raw: survey,
            };
        }).filter((survey: any) => survey.id);

        const selectedSurvey =
            availableSurveys.find((survey: any) => requested && String(survey.id) === requested) ||
            availableSurveys.find((survey: any) => String(survey.id) === String(visita?.pesquisa_id || visita?.pesquisaId || '')) ||
            availableSurveys[0];

        const selectedSurveyId = selectedSurvey?.id || pickFirstFilled(visita?.pesquisa_id, visita?.pesquisaId);
        const selectedSurveyTitle = selectedSurvey?.titulo || pickFirstFilled(visita?.pesquisa_titulo, visita?.pesquisaTitulo, 'Pesquisa de Loja');

        const questions = (selectedSurvey?.questions || []).map((question: any) => ({
            ...question,
            pesquisaId: question?.pesquisaId || question?.pesquisa_id || selectedSurveyId,
            pesquisa_id: question?.pesquisa_id || question?.pesquisaId || selectedSurveyId,
            pesquisaTitulo: question?.pesquisaTitulo || question?.pesquisa_titulo || selectedSurveyTitle,
            pesquisa_titulo: question?.pesquisa_titulo || question?.pesquisaTitulo || selectedSurveyTitle,
        }));

        const selectedSurveyRaw = selectedSurvey?.raw || selectedSurvey || {};

        return {
            selectedSurveyId,
            selectedSurveyTitle,
            selectedSurveyRaw,
            selectedSurveyHasExplicitState: hasExplicitSurveyCompletionState(selectedSurveyRaw),
            selectedSurveyCompleted: getSurveyCompletedFlag(selectedSurveyRaw),
            selectedSurveyServerStateUpdatedAt: getSurveyServerStateUpdatedAt(selectedSurveyRaw, visita),
            questions,
            availableSurveys,
        };
    }

    const selectedSurveyId = requested || getSurveyIdFromVisitPayload(visita, rawPayload);
    const selectedSurveyTitle = getSurveyTitleFromVisitPayload(visita, rawPayload);

    const questions = requested
        ? rawPayload.filter((question: any) => {
            const questionSurveyId = getQuestionSurveyId(question);
            return !questionSurveyId || String(questionSurveyId) === requested;
        })
        : rawPayload;

    const selectedSurveyRaw = { id: selectedSurveyId, titulo: selectedSurveyTitle };

    return {
        selectedSurveyId,
        selectedSurveyTitle,
        selectedSurveyRaw,
        selectedSurveyHasExplicitState: hasExplicitSurveyCompletionState(selectedSurveyRaw),
        selectedSurveyCompleted: getSurveyCompletedFlag(selectedSurveyRaw),
        selectedSurveyServerStateUpdatedAt: getSurveyServerStateUpdatedAt(selectedSurveyRaw, visita),
        questions: questions.map((question: any) => ({
            ...question,
            pesquisaId: question?.pesquisaId || question?.pesquisa_id || selectedSurveyId,
            pesquisa_id: question?.pesquisa_id || question?.pesquisaId || selectedSurveyId,
            pesquisaTitulo: question?.pesquisaTitulo || question?.pesquisa_titulo || selectedSurveyTitle,
            pesquisa_titulo: question?.pesquisa_titulo || question?.pesquisaTitulo || selectedSurveyTitle,
        })),
        availableSurveys: [{
            id: selectedSurveyId,
            titulo: selectedSurveyTitle,
            questions,
        }],
    };
};

const getRegistroVisitaId = (visita: any) =>
    pickFirstFilled(visita?.registro_visita_id, visita?.registroVisitaId, visita?.registro_id, visita?.registroId, visita?.registroVisita?.id);

const getVisitaAgendadaId = (visita: any) =>
    pickFirstFilled(visita?.visita_id_json, visita?.visitaIdJson, visita?.visita_agendada_id, visita?.visitaAgendadaId, visita?.visita_id, visita?.visitaId, visita?.id);

const checkSurveyIsMandatory = (pergunta: any) => {
    let v = pergunta.validacao || {};
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch(e) { v = {}; } }
    return pergunta.obrigatorio === true || v.obrigatorio === true || String(v.obrigatorio) === 'true';
};

const parseNumericValue = (val: any): number => {
    if (val === undefined || val === null || val === '') return NaN;
    if (typeof val === 'number') return val;
    let str = String(val).trim().replace(/[^0-9.,-]/g, ''); 
    if (str === '') return NaN;
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    if (lastComma > lastDot) str = str.replace(/\./g, '').replace(',', '.');
    else str = str.replace(/,/g, '');
    return Number(str);
};

const normalizarChaveEstoqueMobile = (value: any, fallback: string = 'ESTOQUE') => {
    const clean = String(value || fallback)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toUpperCase();

    return clean || fallback;
};

const getStockActionFromQuestion = (pergunta: any) => {
    const acao = pergunta?.acaoEstoque || pergunta?.acao_estoque || pergunta?.acao_estoque_config;
    if (!acao) return null;

    const ativa = acao.ativa === true || acao.ativa === 'true' || acao.active === true || acao.active === 'true';
    if (!ativa) return null;

    const operacaoRaw = String(acao.operacao || acao.tipoAcao || acao.tipoAcaoEstoque || acao.tipo || 'SUBTRAIR').toUpperCase();
    const operacao = ['SOMAR', 'SUBTRAIR', 'SUBSTITUIR'].includes(operacaoRaw) ? operacaoRaw : 'SUBTRAIR';

    const movimentoTipo = String(
        acao.movimentoTipo ||
        acao.movimento_tipo ||
        (operacao === 'SOMAR' ? 'ENTRADA' : operacao === 'SUBSTITUIR' ? 'INVENTARIO' : 'SAIDA')
    ).toUpperCase();

    return {
        ...acao,
        ativa,
        operacao,
        movimentoTipo,
        itemId: acao.itemId || acao.item_id || null,
        perguntaItemId: acao.perguntaItemId || acao.pergunta_item_id || null,
        itemOrigem: String(acao.itemOrigem || acao.item_origem || (acao.itemId || acao.item_id ? 'ITEM_FIXO' : 'CHAVE_MANUAL')).toUpperCase(),
        escopo: String(acao.escopo || 'LOJA').toUpperCase(),
        chave: acao.chave || acao.codigo || acao.key || '',
        permitirSaldoNegativo:
            acao.permitirSaldoNegativo === true ||
            acao.permitir_saldo_negativo === true ||
            acao.allowNegativeStock === true ||
            acao.allow_negative_stock === true,
    };
};

const getStockEffect = (saldoAnterior: number, quantidade: number, operacao: string) => {
    if (operacao === 'SOMAR') return saldoAnterior + quantidade;
    if (operacao === 'SUBSTITUIR') return quantidade;
    return saldoAnterior - quantidade;
};

// 🛡️ MOTOR DE FÓRMULAS RESTAURADO (Lê as chaves {{ }})
const getRawContextValue = (slug: string, contextProduct: any, visitObj: any): any => {
    if (slug.startsWith('produto.') && contextProduct) {
        let fieldName = slug.replace('produto.', '').trim();
        if (fieldName === 'preco_custo') fieldName = 'preco_minimo';
        if (fieldName === 'preco_venda') fieldName = 'preco_maximo';
        let val: any = contextProduct[fieldName];
        if (fieldName === 'preco_minimo' && contextProduct.preco_mix_minimo !== undefined) val = contextProduct.preco_mix_minimo;
        if (fieldName === 'preco_maximo' && contextProduct.preco_mix_maximo !== undefined) val = contextProduct.preco_mix_maximo;
        if (val === undefined || val === null || val === '') return 0;
        if (fieldName.includes('preco') || fieldName === 'min' || fieldName === 'max') return isNaN(parseNumericValue(val)) ? 0 : parseNumericValue(val);
        return typeof val === 'number' ? val : `"${val}"`;
    }
    if (slug.startsWith('loja.custom_data.') && visitObj?.loja_custom_data) {
        const key = slug.replace('loja.custom_data.', '');
        const cData = typeof visitObj.loja_custom_data === 'string' ? JSON.parse(visitObj.loja_custom_data) : visitObj.loja_custom_data;
        const val = cData ? cData[key] : 0;
        return !isNaN(parseNumericValue(val)) ? parseNumericValue(val) : `"${val}"`;
    }
    if (slug.startsWith('loja.') && visitObj) return visitObj[`loja_${slug.replace('loja.', '')}`] || visitObj[slug.replace('loja.', '')];
    return 0;
};

const evaluateMobileFormula = (formula: string, contextProduct: any, currentValue: any, visitObj: any): boolean => {
    try {
        let parsedFormula = formula;
        if (currentValue !== undefined && currentValue !== null && currentValue !== '') {
           let finalVal = parseNumericValue(currentValue);
           parsedFormula = parsedFormula.replace(/{{valor}}/g, String(isNaN(finalVal) ? 0 : finalVal));
        }
        const variables = parsedFormula.match(/{{(.*?)}}/g);
        if (variables) {
            variables.forEach(v => {
                const slug = v.replace('{{', '').replace('}}', '').trim();
                let val: any = 0;
                if (slug.startsWith('produto.') && contextProduct) {
                    let field = slug.replace('produto.', '').trim();
                    if (field === 'preco_custo') field = 'preco_minimo';
                    if (field === 'preco_venda') field = 'preco_maximo';
                    val = parseNumericValue(contextProduct[field]);
                } else {
                    val = getRawContextValue(slug, contextProduct, visitObj);
                }
                parsedFormula = parsedFormula.split(v).join(String(isNaN(val) ? 0 : val));
            });
        }
        return new Function(`return ${parsedFormula}`)();
    } catch (e) { return true; }
};


const normalizePolicyText = (value: any) =>
    String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();

const getPhotoOrientationPolicy = (pergunta: any, fallback?: any) => {
    const v = pergunta?.validacao || {};
    const raw = pickFirstFilled(
        v.orientacaoFoto,
        v.orientacao,
        v.photoOrientation,
        v.photo_orientation,
        fallback
    );

    const normalized = normalizePolicyText(raw || 'ANY');

    if (['HORIZONTAL', 'PAISAGEM', 'LANDSCAPE'].includes(normalized)) return 'HORIZONTAL';
    if (['VERTICAL', 'RETRATO', 'PORTRAIT'].includes(normalized)) return 'VERTICAL';

    return 'ANY';
};

const assetMatchesOrientation = (asset: any, orientation: 'ANY' | 'HORIZONTAL' | 'VERTICAL') => {
    if (orientation === 'ANY') return true;
    if (!asset?.width || !asset?.height) return true;

    if (orientation === 'HORIZONTAL') return Number(asset.width) >= Number(asset.height);
    if (orientation === 'VERTICAL') return Number(asset.height) >= Number(asset.width);

    return true;
};

const getPhotoConfigFromVisit = (visitObj: any) => {
    const projectConfig = safeParseObject(visitObj?.project_config_json || visitObj?.projectConfigJson || visitObj?.project_config);
    const perfilMobile = safeParseObject(projectConfig?.perfil_mobile || visitObj?.perfil_mobile || visitObj?.perfilMobile);
    const nestedProject = safeParseObject(projectConfig?.project || perfilMobile?.project || visitObj?.project);

    const readBool = (...values: any[]) => values.some((value) => isTruthy(value));

    return {
        blockGallery: readBool(
            visitObj?.blockGallery,
            visitObj?.disableGallery,
            visitObj?.block_gallery,
            visitObj?.disable_gallery,
            projectConfig?.blockGallery,
            projectConfig?.disableGallery,
            projectConfig?.block_gallery,
            projectConfig?.disable_gallery,
            nestedProject?.blockGallery,
            nestedProject?.disableGallery,
            nestedProject?.block_gallery,
            nestedProject?.disable_gallery
        ),
        forceLiveCamera: readBool(
            visitObj?.forceLiveCamera,
            visitObj?.force_live_camera,
            projectConfig?.forceLiveCamera,
            projectConfig?.force_live_camera,
            nestedProject?.forceLiveCamera,
            nestedProject?.force_live_camera
        ),
        watermarkPhotos: readBool(
            visitObj?.watermarkPhotos,
            visitObj?.watermark_photos,
            visitObj?.watermark,
            projectConfig?.watermarkPhotos,
            projectConfig?.watermark_photos,
            projectConfig?.watermark,
            nestedProject?.watermarkPhotos,
            nestedProject?.watermark_photos,
            nestedProject?.watermark
        ),
        defaultOrientation: pickFirstFilled(
            projectConfig?.photoOrientation,
            projectConfig?.photo_orientation,
            nestedProject?.photoOrientation,
            nestedProject?.photo_orientation,
            'ANY'
        ),
    };
};

export default function SurveyExecutionScreen() {
  const { id, pesquisaId } = useLocalSearchParams(); 
  const router = useRouter();
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { theme, language } = useSettingsStore();
  const isDark = theme === 'dark';

  const translate = useCallback(
      (key: string, fallback: string, params?: Record<string, string | number>) => {
          const value = t(key, params as any);
          if (value && value !== key) return String(value);

          return fallback.replace(/\{\{(\w+)\}\}/g, (_, paramKey) => String(params?.[paramKey] ?? ''));
      },
      [language]
  );

  const bg = isDark ? '#0B0F19' : '#F4F7FC';
  const cardBg = isDark ? '#151A27' : '#FFFFFF';
  const textPrimary = isDark ? '#FFFFFF' : '#1E293B';
  const textSecondary = isDark ? '#8F9BB3' : '#64748B';
  const border = isDark ? '#1E293B' : '#E2E8F0';
  const accent = '#3B82F6'; 
  const errorColor = '#EF4444';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [visita, setVisita] = useState<any>(null);
  
  const [produtosDoMix, setProdutosDoMix] = useState<any[]>([]); 
  const [pesquisasRaw, setPesquisasRaw] = useState<any[]>([]);
  
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);

  const scrollViewRef = useRef<ScrollView>(null);
  const inputRefs = useRef<Record<string, any>>({}); 
  const layoutRefs = useRef<Record<string, number>>({});
  const photosRef = useRef<Record<string, { uri: string, base64: string }[]>>({});
  const watermarkRef = useRef<View>(null);
  const watermarkResolverRef = useRef<{
      resolve: (value: { uri: string; base64: string }) => void;
      reject: (error: any) => void;
  } | null>(null);
  const [watermarkJob, setWatermarkJob] = useState<{ uri: string; text: string } | null>(null);

  const [customAlert, setCustomAlert] = useState<{
      visible: boolean;
      type: 'error' | 'warning' | 'success';
      title: string;
      message: string;
      onConfirm?: () => void;
      onCancel?: () => void;
      confirmText?: string;
      cancelText?: string;
  }>({
      visible: false, type: 'error', title: '', message: ''
  });

  const showCustomAlert = (type: 'error'|'warning'|'success', title: string, message: string, onConfirm?: () => void, onCancel?: () => void, confirmText?: string, cancelText?: string) => {
      setCustomAlert({ visible: true, type, title, message, onConfirm, onCancel, confirmText, cancelText });
  };

  const closeCustomAlert = () => setCustomAlert(prev => ({ ...prev, visible: false }));

  const [selectionSheet, setSelectionSheet] = useState<{
      visible: boolean;
      title: string;
      answerKey: string;
      options: Array<{ label: string; value: string; raw?: any }>;
      selectedValue?: string;
      search: string;
  }>({
      visible: false,
      title: '',
      answerKey: '',
      options: [],
      selectedValue: '',
      search: '',
  });

  const closeSelectionSheet = () => {
      setSelectionSheet(prev => ({ ...prev, visible: false }));
  };

  const openSelectionSheet = (title: string, answerKey: string, options: Array<{ label: string; value: string; raw?: any }>, selectedValue?: string) => {
      setSelectionSheet({
          visible: true,
          title,
          answerKey,
          options,
          selectedValue: selectedValue || '',
          search: '',
      });
  };

  const selectOptionFromSheet = (option: { label: string; value: string; raw?: any }) => {
      if (!selectionSheet.answerKey) return;
      handleTextChange(selectionSheet.answerKey, option.value);
      closeSelectionSheet();
  };

  useEffect(() => {
    const carregarTudo = async () => {
        try {
            const db = await getDBConnection();
            const res = await db.getAllAsync(`SELECT * FROM visits WHERE id = ?`, [String(id)]);

            if (res.length > 0) {
                const v = res[0] as any;
                const visitSurveys = safeParseArray(v.pesquisa_json);
                const requestedSurveyId = Array.isArray(pesquisaId) ? pesquisaId[0] : pesquisaId;
                const selectedPayload = normalizeVisitSurveyPayload(v, visitSurveys, requestedSurveyId);

                const draftKey = `survey_answers_${id}_${selectedPayload.selectedSurveyId || 'default'}`;
                const serverSaysPending = selectedPayload.selectedSurveyHasExplicitState && !selectedPayload.selectedSurveyCompleted;
                const hasNewerLocalPending = serverSaysPending
                    ? await checkPendingLocalCollectionIsNewer(db, v, selectedPayload.selectedSurveyId, selectedPayload.selectedSurveyServerStateUpdatedAt)
                    : false;

                if (serverSaysPending && !hasNewerLocalPending) {
                    await SecureStore.deleteItemAsync(draftKey).catch(() => {});
                    await clearStaleLocalSurveyData(db, v, selectedPayload.selectedSurveyId, selectedPayload.selectedSurveyServerStateUpdatedAt);
                    photosRef.current = {};
                    setAnswers({});
                } else {
                    const savedDraft = await SecureStore.getItemAsync(draftKey);
                    if (savedDraft) {
                        setAnswers(JSON.parse(savedDraft));
                    } else {
                        setAnswers({});
                    }
                }

                setVisita({ 
                    ...v, 
                    loja_custom_data: safeParseArray(v.loja_custom_data_json || '{}'),
                    pesquisa_id_real: selectedPayload.selectedSurveyId,
                    pesquisa_titulo_real: selectedPayload.selectedSurveyTitle,
                    registro_visita_id: getRegistroVisitaId(v),
                    visita_id_json: getVisitaAgendadaId(v)
                });
                let produtosVisita = safeParseArray(v.produtos_json);

                if (produtosVisita.length === 0) {
                    try {
                        const hasProdutos = await db.getAllAsync(`SELECT name FROM sqlite_master WHERE type='table' AND name='produtos'`);
                        if (hasProdutos?.length > 0) {
                            produtosVisita = await db.getAllAsync(`SELECT * FROM produtos`);
                        }
                    } catch {}
                }

                setProdutosDoMix(produtosVisita);
                setPesquisasRaw(selectedPayload.questions);
            } else {
                showCustomAlert(
                  'error',
                  translate('commonOops', 'Ops!'),
                  translate('visitNotFoundLocal', 'Visita não encontrada no banco local.'),
                  () => router.back(),
                  undefined,
                  translate('commonBack', 'Voltar')
              );
            }
        } catch (error) {
            console.error('Erro SQLite:', error);
        } finally {
            setLoading(false);
        }
    };
    if (id) carregarTudo();
  }, [id, pesquisaId]);

  const perguntas = useMemo(() => {
      let listaPlana: any[] = [];
      if (pesquisasRaw.length > 0) {
          if (pesquisasRaw[0].perguntas) {
              pesquisasRaw.forEach(p => { if (Array.isArray(p.perguntas)) listaPlana = [...listaPlana, ...p.perguntas]; });
          } else {
              listaPlana = pesquisasRaw;
          }
      }

      return listaPlana.map((p: any) => {
          let v = p.validacao || {};
          if (typeof v === 'string') { try { v = JSON.parse(v); } catch(e) { v = {}; } }

          let r = p.regrasExibicao || p.regras_exibicao;
          if (typeof r === 'string') { try { r = JSON.parse(r); } catch(e){ r = []; } }

          const f = safeParseObject(p.filtroProduto || p.filtros_produto || p.filtro_produto);
          const acaoRaw = safeParseObject(p.acaoEstoque || p.acao_estoque || p.acao_estoque_config);

          const tipoStr = String(p.tipo || '').toUpperCase();
          const isGrupoReal = tipoStr === 'GRUPO' || tipoStr === 'SECAO' || p.is_grupo === true || v.is_grupo === true || v.isGrupo === true || String(v.is_grupo) === 'true' || String(v.isGrupo) === 'true';

          const validacaoNormalizada = {
              ...v,
              is_grupo: isGrupoReal,
              permite_fura_bloqueio: isTruthy(v.permite_fura_bloqueio) || isTruthy(v.permiteFuraBloqueio),
              multiplasFotos: isTruthy(v.multiplasFotos) || isTruthy(v.multiplas_fotos),
              multiplas_fotos: isTruthy(v.multiplas_fotos) || isTruthy(v.multiplasFotos),
              maxFotos: v.maxFotos ?? v.max_fotos,
              max_fotos: v.max_fotos ?? v.maxFotos,
              orientacao: String(v.orientacaoFoto || v.orientacao || 'LIVRE').toUpperCase(),
              foto_por_opcao: isTruthy(v.foto_por_opcao) || isTruthy(v.fotoPorOpcao),
              fotoPorOpcao: isTruthy(v.fotoPorOpcao) || isTruthy(v.foto_por_opcao),
              multiplas_fotos_por_opcao: isTruthy(v.multiplas_fotos_por_opcao) || isTruthy(v.multiplasFotosPorOpcao),
              multiplasFotosPorOpcao: isTruthy(v.multiplasFotosPorOpcao) || isTruthy(v.multiplas_fotos_por_opcao),
              max_fotos_por_opcao: v.max_fotos_por_opcao ?? v.maxFotosPorOpcao,
              maxFotosPorOpcao: v.maxFotosPorOpcao ?? v.max_fotos_por_opcao,
          };

          return { 
              ...p,
              tipo: tipoStr,
              isGrupoReal,
              validacao: validacaoNormalizada,
              regras_exibicao: (r || []).map((regra: any) => ({
                  perguntaId: regra.alvoId || regra.perguntaId || regra.questionId || regra.pergunta_id,
                  operador: regra.operador || regra.operator,
                  valor: regra.valor ?? regra.value
              })),
              filtros_produto: f || {},
              filtroProduto: f || {},
              acaoEstoque: acaoRaw || {},
              acao_estoque: acaoRaw || {},
              escopo: String(p.escopo || v.escopo || 'GLOBAL').toUpperCase()
          };
      }).sort((a: any, b: any) => (Number(a.ordem) || 999) - (Number(b.ordem) || 999));
  }, [pesquisasRaw]);

  const perguntasLookup = useMemo(() => {
      const byId = new Map<string, any>();
      const byRef = new Map<string, any>();

      perguntas.forEach((q: any) => {
          if (!q) return;

          const id = String(q.id || '').trim();
          if (id) {
              byId.set(id, q);
              byRef.set(normalizar(id), q);
          }

          const codigo = String(q.codigo_referencia || q.codigoReferencia || '').trim();
          if (codigo) byRef.set(normalizar(codigo), q);
      });

      return { byId, byRef };
  }, [perguntas]);

  const sortedProdutosDoMix = useMemo(() => {
      return [...produtosDoMix].sort((a: any, b: any) =>
          normalizeOptionSortText(a.nome || a.name || a.descricao || a.description || a.id).localeCompare(
              normalizeOptionSortText(b.nome || b.name || b.descricao || b.description || b.id),
              'pt-BR',
              { numeric: true, sensitivity: 'base' }
          )
      );
  }, [produtosDoMix]);

  const surveySections = useMemo(() => {
      const result: { group: any | null, globals: any[], products: any[] }[] = [];
      let currentSection: { group: any | null, globals: any[], products: any[] } = { group: null, globals: [], products: [] };

      perguntas.forEach((q: any) => {
          if (q.isGrupoReal) {
              if (currentSection.group || currentSection.globals.length > 0 || currentSection.products.length > 0) result.push(currentSection);
              currentSection = { group: q, globals: [], products: [] };
          } else {
              if (q.escopo === 'PRODUTO') currentSection.products.push(q);
              else currentSection.globals.push(q);
          }
      });
      result.push(currentSection);
      return result;
  }, [perguntas]);

  useEffect(() => {
      setCollapsedGroups(surveySections.map(s => s.group?.id).filter(Boolean));
  }, [surveySections]);

  const toggleGroupCollapse = (groupId: string) => {
      setCollapsedGroups(prev => prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]);
  };

  const checkCondition = (operator: string, answerVal: any, conditionVal: any, targetType: string = 'TEXTO'): boolean => {
      if (answerVal === undefined || answerVal === null || answerVal === '') return false;
      
      const op = String(operator).trim().toUpperCase();
      
      if (Array.isArray(answerVal)) {
          if (op === 'CONTAINS' || op === 'CONTEM' || op === 'EQUALS' || op === '==' || op === '=') {
              return answerVal.some(a => normalizar(a) === normalizar(conditionVal));
          }
          if (op === 'NOT_CONTAINS' || op === 'NAO_CONTEM' || op === 'NOT_EQUALS' || op === '!=') {
              return !answerVal.some(a => normalizar(a) === normalizar(conditionVal));
          }
          return false;
      }

      let cStr = normalizar(conditionVal);
      let aStr = normalizar(answerVal);

      if (['NUMERO', 'NUMBER', 'INTEIRO', 'INTEGER', 'DECIMAL', 'MOEDA'].includes(String(targetType || '').toUpperCase())) {
          if (aStr === '' && !['EQUALS', '==', '!=', 'NOT_EQUALS'].includes(op)) return false;
          const cNum = parseNumericValue(conditionVal);
          const aNum = parseNumericValue(answerVal);
          
          if (isNaN(aNum) || isNaN(cNum)) return false;
          switch (op) {
              case 'EQUALS': case '==': case '=': return aNum === cNum;
              case 'NOT_EQUALS': case '!=': return aNum !== cNum;
              case 'GREATER_THAN': case '>': return aNum > cNum;
              case 'LESS_THAN': case '<': return aNum < cNum;
              case 'GREATER_THAN_EQUALS': case '>=': return aNum >= cNum;
              case 'LESS_THAN_EQUALS': case '<=': return aNum <= cNum;
              default: return false;
          }
      } else {
          switch (op) {
              case 'EQUALS': case '==': case '=': return aStr === cStr;
              case 'NOT_EQUALS': case '!=': return aStr !== cStr;
              case 'CONTAINS': case 'CONTEM': return aStr.includes(cStr);
              case 'NOT_CONTAINS': case 'NAO_CONTEM': return !aStr.includes(cStr);
              default: return false;
          }
      }
  };

  const isQuestionVisible = useCallback((pergunta: any, produtoId?: string) => {
      if (!pergunta.regras_exibicao || pergunta.regras_exibicao.length === 0) return true;
      
      return pergunta.regras_exibicao.every((regra: any) => {
          const targetRef = normalizar(regra.perguntaId);
          const operador = regra.operador;
          let valorAlvo = regra.valor;

          if (!targetRef || !operador) return true;

          let currentAnswer;
          let targetType = 'TEXTO'; 

          if (String(regra.perguntaId).startsWith('loja.custom_data.')) {
              currentAnswer = visita?.loja_custom_data?.[regra.perguntaId.replace('loja.custom_data.', '')];
          } else if (targetRef.includes('bandeira')) {
              currentAnswer = visita?.bandeira;
          } else if (targetRef.includes('rede')) {
              currentAnswer = visita?.rede;
          } else {
              const targetQ =
                  perguntasLookup.byId.get(String(regra.perguntaId || '').trim()) ||
                  perguntasLookup.byRef.get(targetRef);

              if (!targetQ) return true;
              
              const key = produtoId && targetQ.escopo === 'PRODUTO' ? `${targetQ.id}::${produtoId}` : targetQ.id;
              currentAnswer = answers[key] ?? answers[targetQ.id];
              targetType = targetQ.tipo;
          }
          
          return checkCondition(operador, currentAnswer, valorAlvo, targetType);
      });
  }, [perguntasLookup, answers, visita]);

  const shouldShowProductForQuestion = (p: any, prod: any) => {
      const f = p.filtros_produto || p.filtroProduto || {};
      if (!f || Object.keys(f).length === 0) return true;

      const origem = String(f.origem || 'AMBOS').toUpperCase();
      const prodConcorrente = prod.concorrente === true || String(prod.origem || '').toUpperCase() === 'CONCORRENTE';

      if (origem === 'PROPRIOS' && prodConcorrente) return false;
      if (origem === 'CONCORRENTES' && !prodConcorrente) return false;

      const prodCategoriaId = prod.categoriaId || prod.categoria_id || prod.categoria?.id;
      const prodSubcategoriaId = prod.subcategoriaId || prod.subcategoria_id || prod.subcategoria?.id;

      if (f.categoriaId && prodCategoriaId !== f.categoriaId) return false;
      if (f.subcategoriaId && prodSubcategoriaId !== f.subcategoriaId) return false;
      if (f.marca?.trim().toLowerCase() && prod.marca?.trim().toLowerCase() !== f.marca?.trim().toLowerCase()) return false;

      return true;
  };

  const productOptionsByQuestionId = useMemo(() => {
      const cache = new Map<string, Array<{ label: string; value: string; productId: any; raw: any }>>();

      perguntas.forEach((pergunta: any) => {
          const f = pergunta.filtros_produto || pergunta.filtroProduto || {};
          const hasProductFilter = f && Object.keys(f).length > 0;
          const usesDynamicProducts = parseOptionsForMobile(pergunta.opcoes).some(isDynamicProductOption);

          if (!hasProductFilter && !usesDynamicProducts) {
              cache.set(String(pergunta.id), []);
              return;
          }

          const options = sortedProdutosDoMix
              .filter((prod) => shouldShowProductForQuestion(pergunta, prod))
              .map((prod) => ({
                  label: String(prod.nome || prod.name || prod.descricao || prod.id),
                  value: String(prod.nome || prod.name || prod.descricao || prod.id),
                  productId: prod.id,
                  raw: prod,
              }));

          cache.set(String(pergunta.id), options);
      });

      return cache;
  }, [perguntas, sortedProdutosDoMix]);

  const buildProductOptionsForQuestion = useCallback((pergunta: any) => {
      return productOptionsByQuestionId.get(String(pergunta.id)) || [];
  }, [productOptionsByQuestionId]);

  const buildWatermarkText = () => {
      const now = new Date();
      const lojaNome = visita?.loja_nome || visita?.lojaNome || translate('perfectStoreDefaultStore', 'Loja');
      const usuarioNome = user?.nome || user?.name || translate('profileUserFallback', 'Usuário');

      return `${lojaNome} • ${usuarioNome} • ${now.toLocaleString('pt-BR')}`;
  };

  const applyWatermarkIfNeeded = async (asset: any) => {
      const photoConfig = getPhotoConfigFromVisit(visita);

      if (!photoConfig.watermarkPhotos) {
          return {
              uri: asset.uri,
              base64: `data:image/jpeg;base64,${asset.base64}`,
          };
      }

      return new Promise<{ uri: string; base64: string }>((resolve, reject) => {
          watermarkResolverRef.current = { resolve, reject };
          setWatermarkJob({
              uri: asset.uri,
              text: buildWatermarkText(),
          });
      });
  };

  const handleWatermarkImageLoaded = async () => {
      try {
          if (!watermarkRef.current || !watermarkResolverRef.current) return;

          // Aguarda o React Native terminar de desenhar a imagem + overlay antes do captureRef.
          await new Promise((resolve) => setTimeout(resolve, 350));

          const capturedUri = await captureRef(watermarkRef.current, {
              format: 'jpg',
              quality: 0.9,
              result: 'tmpfile',
          });

          const base64 = await FileSystem.readAsStringAsync(capturedUri, {
              encoding: FileSystem.EncodingType.Base64,
          });

          watermarkResolverRef.current.resolve({
              uri: capturedUri,
              base64: `data:image/jpeg;base64,${base64}`,
          });
      } catch (error) {
          watermarkResolverRef.current?.reject(error);
      } finally {
          watermarkResolverRef.current = null;
          setWatermarkJob(null);
      }
  };

  const handlePhotoRequest = async (pergunta: any, answerKey: string, optionName?: string) => {
      const isOptionPhoto = !!optionName;
      const targetKey = isOptionPhoto ? `${answerKey}::foto_${optionName}` : answerKey;

      if (errorKey === answerKey) setErrorKey(null); 

      const v = pergunta.validacao || {};
      const photoConfig = getPhotoConfigFromVisit(visita);
      const isMultiple = isOptionPhoto
          ? (v.multiplas_fotos_por_opcao === true || v.multiplasFotosPorOpcao === true)
          : (v.multiplasFotos === true || v.multiplas_fotos === true);

      const maxFotos = Number(isOptionPhoto ? (v.max_fotos_por_opcao ?? v.maxFotosPorOpcao) : (v.maxFotos ?? v.max_fotos)) || 0;
      const currentPhotos = photosRef.current[targetKey] || [];

      if (maxFotos > 0 && currentPhotos.length >= maxFotos) {
          showCustomAlert(
              'warning',
              translate('photoLimitTitle', 'Limite de fotos'),
              translate('photoLimitMessage', 'Limite de {{max}} foto(s) atingido para esta opção.', { max: maxFotos })
          );
          return;
      }

      const requiredOrientation = getPhotoOrientationPolicy(pergunta, photoConfig.defaultOrientation);
      const orientationLabel = requiredOrientation === 'HORIZONTAL'
          ? translate('photoHorizontalLandscape', 'horizontal/paisagem')
          : translate('photoVerticalPortrait', 'vertical/retrato');

      const processAsset = async (asset: any) => {
          if (!asset?.uri || !asset?.base64) return;

          if (!assetMatchesOrientation(asset, requiredOrientation)) {
              showCustomAlert(
                  'error',
                  translate('photoWrongOrientationTitle', 'Orientação incorreta'),
                  translate('photoWrongOrientationMessage', 'Esta foto precisa ser tirada na orientação {{orientation}}. Tire uma nova foto para continuar.', { orientation: orientationLabel })
              );
              return;
          }

          const photoPayload = await applyWatermarkIfNeeded(asset);

          if (!photosRef.current[targetKey]) photosRef.current[targetKey] = [];

          if (isMultiple) {
              photosRef.current[targetKey].push(photoPayload);
          } else {
              photosRef.current[targetKey] = [photoPayload];
          }

          setAnswers(prev => ({
              ...prev,
              [targetKey]: photosRef.current[targetKey].map(p => p.uri)
          }));
      };

      const takePhoto = async () => {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
              showCustomAlert(
                  'error',
                  translate('permissionRequiredTitle', 'Permissão necessária'),
                  translate('cameraPermissionRequired', 'A câmera precisa estar liberada para tirar a foto.')
              );
              return;
          }

          const res = await ImagePicker.launchCameraAsync({ quality: 0.2, base64: true }); 
          if (!res.canceled && res.assets?.[0]) await processAsset(res.assets[0]);
      };

      if (photoConfig.blockGallery || photoConfig.forceLiveCamera) {
          await takePhoto();
          return;
      }

      Alert.alert(
          translate('photoAttachTitle', 'Anexar imagem'),
          isOptionPhoto
              ? translate('photoAttachOptionMessage', 'Origem da foto para: {{option}}', { option: optionName || '' })
              : translate('photoAttachSourceMessage', 'Escolha a origem'),
          [
              { text: translate('photoCamera', 'Câmera'), onPress: takePhoto },
              { text: translate('photoGallery', 'Galeria'), onPress: async () => {
                  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
                  if (!permission.granted) {
                      showCustomAlert(
                          'error',
                          translate('permissionRequiredTitle', 'Permissão necessária'),
                          translate('galleryPermissionRequired', 'A galeria precisa estar liberada para anexar a foto.')
                      );
                      return;
                  }

                  const res = await ImagePicker.launchImageLibraryAsync({
                      mediaTypes: ['images'],
                      quality: 0.2,
                      base64: true,
                      allowsMultipleSelection: isMultiple
                  });

                  if (!res.canceled && res.assets) {
                      for (const asset of res.assets) {
                          await processAsset(asset);
                      }
                  }
              }},
              { text: translate('cancel', 'Cancelar'), style: "cancel" }
          ]
      );
  };

  const removePhoto = (targetKey: string, indexToRemove: number) => {
      if (photosRef.current[targetKey]) {
          photosRef.current[targetKey].splice(indexToRemove, 1);
          setAnswers(prev => ({ ...prev, [targetKey]: photosRef.current[targetKey].map(p => p.uri) }));
      }
  };

  const handleTextChange = (answerKey: string, text: string, isDec: boolean = false) => {
      if (errorKey === answerKey) setErrorKey(null);
      if (isDec) {
          const cleaned = text.replace(/[^0-9]/g, '');
          if (!cleaned) {
              setAnswers(prev => ({ ...prev, [answerKey]: '' }));
          } else {
              const val = (parseInt(cleaned, 10) / 100).toFixed(2).replace('.', ',');
              setAnswers(prev => ({ ...prev, [answerKey]: val }));
          }
      } else {
          setAnswers(prev => ({ ...prev, [answerKey]: text }));
      }
  };

  const scrollToError = (key: string) => {
      if (layoutRefs.current[key] !== undefined && scrollViewRef.current) {
          scrollViewRef.current.scrollTo({ y: Math.max(0, layoutRefs.current[key] - 50), animated: true });
      }
  };

  const getVisitProjectConfig = () => {
      return safeParseObject(visita?.project_config || visita?.projectConfig || visita?.project_config_json || {});
  };

  const getAllStockRows = () => {
      const cfg = getVisitProjectConfig();
      const rows = [
          ...safeParseArray(cfg.estoque_saldos || cfg.estoqueSaldos || cfg.stockBalances || cfg.stock_balances),
      ];

      produtosDoMix.forEach((prod: any) => {
          safeParseArray(prod?.estoque_saldos || prod?.estoqueSaldos || prod?.stockBalances || prod?.stock_balances).forEach((row: any) => {
              rows.push({
                  ...row,
                  produtoId: row.produtoId || row.produto_id || prod.id,
                  produto_id: row.produto_id || row.produtoId || prod.id,
              });
          });
      });

      return rows;
  };

  const findProductByAnyValue = (value: any) => {
      const target = normalizar(String(value || ''));
      if (!target) return null;

      return produtosDoMix.find((prod: any) => {
          return [
              prod?.id,
              prod?.nome,
              prod?.name,
              prod?.descricao,
              prod?.description,
              prod?.sku,
              prod?.ean,
          ].some((candidate) => normalizar(String(candidate || '')) === target);
      }) || null;
  };

  const resolveStockTargetProduct = (acao: any, contextProdId?: string | null) => {
      if (contextProdId) {
          return produtosDoMix.find((prod: any) => String(prod.id) === String(contextProdId)) || null;
      }

      if (acao?.itemOrigem === 'PRODUTO_SELECIONADO' && acao?.perguntaItemId) {
          const selectedValue =
              answers[String(acao.perguntaItemId)] ||
              answers[String(acao.perguntaItemId).replace(/::.*$/, '')];

          return findProductByAnyValue(selectedValue);
      }

      return null;
  };

  const getInitialStockBalance = (acao: any, prodContext: any, contextProdId?: string | null) => {
      const directProductBalance = pickFirstFilled(
          prodContext?.saldo_estoque,
          prodContext?.saldoEstoque,
          prodContext?.estoqueSaldo,
          prodContext?.stockBalance,
          prodContext?.stock_balance,
          prodContext?.saldo
      );

      if (directProductBalance !== null && !isNaN(parseNumericValue(directProductBalance))) {
          return parseNumericValue(directProductBalance);
      }

      const rows = getAllStockRows();
      const lojaId = visita?.loja_id || visita?.lojaId || null;
      const produtoId = prodContext?.id || contextProdId || null;
      const itemId = acao?.itemId || null;
      const chave = normalizarChaveEstoqueMobile(acao?.chave || produtoId || itemId || 'ESTOQUE');

      const matchesTarget = (row: any) => {
          const rowProdutoId = row?.produto_id || row?.produtoId || row?.item?.produtoId || null;
          const rowItemId = row?.itemId || row?.item_id || row?.item?.id || null;
          const rowChave = normalizarChaveEstoqueMobile(row?.chave || row?.itemCodigo || row?.item_codigo || row?.codigo || '');

          if (itemId && rowItemId && String(rowItemId) === String(itemId)) return true;
          if (produtoId && rowProdutoId && String(rowProdutoId) === String(produtoId)) return true;
          if (!produtoId && !itemId && rowChave === chave) return true;

          return false;
      };

      const localRows = rows.filter((row: any) => {
          const rowLojaId = row?.loja_id || row?.lojaId || null;
          return matchesTarget(row) && rowLojaId && lojaId && String(rowLojaId) === String(lojaId);
      });

      const globalRows = rows.filter((row: any) => {
          const rowLojaId = row?.loja_id || row?.lojaId || null;
          return matchesTarget(row) && !rowLojaId;
      });

      const selectedRows = localRows.length > 0 ? localRows : globalRows;

      if (selectedRows.length === 0) return 0;

      return selectedRows.reduce((sum: number, row: any) => {
          const saldo = parseNumericValue(pickFirstFilled(row?.saldo, row?.saldoAtual, row?.saldo_atual, row?.stockBalance, row?.stock_balance, 0));
          return sum + (isNaN(saldo) ? 0 : saldo);
      }, 0);
  };

  const buildStockMovementKey = (acao: any, prodContext: any, contextProdId?: string | null) => {
      const lojaPart = acao?.escopo === 'GLOBAL' ? 'GLOBAL' : String(visita?.loja_id || visita?.lojaId || 'LOJA');
      const produtoId = prodContext?.id || contextProdId || null;
      const itemId = acao?.itemId || null;

      if (itemId) return `${lojaPart}::ITEM::${itemId}`;
      if (produtoId) return `${lojaPart}::PRODUTO::${produtoId}`;

      return `${lojaPart}::CHAVE::${normalizarChaveEstoqueMobile(acao?.chave || 'ESTOQUE')}`;
  };

  const processSaveAction = async () => {
      closeCustomAlert();
      setSaving(true);
      try {
          const token = user?.token || "PENDING_TOKEN";
          const respostasArray = [];
          const baseKeys = Object.keys(answers).filter(k => !k.includes('::foto_'));

          for (const baseKey of baseKeys) {
              let baseAnswer = answers[baseKey];
              if (!baseAnswer) continue;

              const parts = baseKey.split('::');
              const pId = parts[0];
              const prodId = parts.length > 1 ? parts[1] : null;
              
              const perguntaConfig = perguntas.find(p => String(p.id) === String(pId));
              if (!perguntaConfig || !isQuestionVisible(perguntaConfig, prodId || undefined)) continue;

              if (perguntaConfig.tipo === 'FOTO') {
                  const actualFotos = photosRef.current[baseKey] || [];
                  if (actualFotos.length > 0) respostasArray.push({ pergunta_id: pId, produto_id: prodId, valor: JSON.stringify(actualFotos.map(f => f.base64)) });
                  continue;
              }
              
              const isMultiple = Array.isArray(baseAnswer);
              respostasArray.push({ pergunta_id: pId, produto_id: prodId, valor: isMultiple ? JSON.stringify(baseAnswer) : String(baseAnswer) });

              const isFotoPorOpcao =
                  perguntaConfig.validacao?.foto_por_opcao === true ||
                  perguntaConfig.validacao?.fotoPorOpcao === true;

              const isOptionQuestion = ['MULTIPLA', 'CHECKBOX', 'SELECAO', 'DROPDOWN'].includes(String(perguntaConfig.tipo || '').toUpperCase());

              if (isFotoPorOpcao && isOptionQuestion) {
                  const optionsSelected = Array.isArray(baseAnswer) ? baseAnswer : [baseAnswer];

                  for (const op of optionsSelected) {
                      const fotoKey = `${baseKey}::foto_${op}`;
                      const optFotosObj = photosRef.current[fotoKey] || [];

                      if (optFotosObj.length > 0) {
                          const cleanOpt = String(op).replace(/[^a-zA-Z0-9]/g, '');
                          respostasArray.push({
                              pergunta_id: `${pId}_${cleanOpt}`,
                              produto_id: prodId,
                              valor: JSON.stringify(optFotosObj.map(f => f.base64)),
                          });
                      }
                  }
              }
          }

          const realLojaId = visita?.loja_id && visita.loja_id !== 'null' && visita.loja_id !== 'undefined' ? visita.loja_id : null;
          const registroVisitaId = getRegistroVisitaId(visita);
          const visitaAgendadaId = getVisitaAgendadaId(visita);
          const idDaPesquisa = getSurveyIdFromVisitPayload(visita, pesquisasRaw);
          const tituloDaPesquisa = getSurveyTitleFromVisitPayload(visita, pesquisasRaw);
          const operationId = `coleta_${visitaAgendadaId || id}_${idDaPesquisa || 'pesquisa'}_${Date.now()}`;

          if (!idDaPesquisa) {
              throw new Error(translate('surveyMissingRealIdError', 'Não foi possível identificar o ID real da pesquisa desta visita. Verifique se a visita recebeu pesquisa_id no roteiro.'));
          }

          const payload = {
              projectId: getProjectId(user, visita),
              project_id: getProjectId(user, visita),
              usuario_id: user?.id,
              usuarioId: user?.id,
              promotorId: user?.id,
              usuario_nome: user?.nome, 
              loja_id: realLojaId,
              lojaId: realLojaId,
              loja_nome: visita?.loja_nome || '',
              registroVisitaId,
              registro_visita_id: registroVisitaId,
              visitaIdJson: visitaAgendadaId,
              visita_id_json: visitaAgendadaId,
              visitaAgendadaId,
              visita_agendada_id: visitaAgendadaId,
              visitaId: visita?.id,
              visita_id: visita?.id,
              roteiroId: visita?.roteiro_id || visita?.roteiroId || null,
              roteiro_id: visita?.roteiro_id || visita?.roteiroId || null,
              pesquisa_id: idDaPesquisa,
              pesquisaId: idDaPesquisa,
              surveyId: idDaPesquisa,
              survey_id: idDaPesquisa,
              pesquisa_titulo: tituloDaPesquisa,
              pesquisaTitulo: tituloDaPesquisa,
              status: 'REALIZADA',
              data_inicio: new Date().toISOString(),
              data_fim: new Date().toISOString(),
              data_programada: visita?.data_programada || new Date().toISOString().split('T')[0],
              respostas: respostasArray,
              origem: 'MOBILE_OFFLINE',
              client_operation_id: operationId,
          };

          const db = await getDBConnection();
          
          if (typeof addToSyncQueue !== 'function') {
              throw new Error(translate('syncQueueFunctionMissing', 'A função addToSyncQueue não foi encontrada'));
          }

          await addToSyncQueue('/coletas', payload, 'POST', token);
          await db.runAsync(
              `UPDATE visits SET pending_sync = 1, updated_at = ? WHERE id = ?`,
              [new Date().toISOString(), String(id)]
          ).catch(async () => {
              // Compatibilidade com bancos locais antigos que ainda não possuem pending_sync/updated_at.
          });

          try {
              const exists = await db.getAllAsync(`SELECT name FROM sqlite_master WHERE type='table' AND name='coletas'`);
              if (exists?.length > 0) {
                  await db.runAsync(
                      `INSERT OR REPLACE INTO coletas (
                          id, project_id, usuario_id, loja_id, visita_id, pesquisa_id, status,
                          data_inicio, data_fim, data_programada, respostas_json, raw_json, pending_sync
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                      [
                          operationId,
                          payload.projectId,
                          payload.usuario_id,
                          payload.loja_id,
                          payload.registroVisitaId || payload.visitaIdJson || payload.visitaId,
                          payload.pesquisa_id,
                          payload.status,
                          payload.data_inicio,
                          payload.data_fim,
                          payload.data_programada,
                          JSON.stringify(respostasArray),
                          JSON.stringify(payload),
                          1,
                      ]
                  ).catch(() => {});
              }
          } catch {}

          await SecureStore.setItemAsync(`survey_answers_${id}_${idDaPesquisa || 'default'}`, JSON.stringify(answers));

          showCustomAlert(
              'success',
              translate('surveySavedTitle', 'Formulário salvo!'),
              translate('surveySavedMessage', 'As respostas foram salvas e serão sincronizadas com a gestão.'),
              () => {
              if (router.canGoBack()) {
                  router.back();
              } else {
                  router.replace('/');
              }
          }, undefined, translate('commonOkUnderstood', 'OK, entendi'));

      } catch (error: any) { 
          console.error("🔥 ERRO CRÍTICO NO SALVAMENTO:", error);
          showCustomAlert(
              'error',
              translate('surveySaveErrorTitle', 'Falha ao salvar'),
              error?.message || translate('surveySaveErrorMessage', 'Ocorreu um erro crítico ao se comunicar com o banco de dados.'),
              undefined,
              closeCustomAlert,
              undefined,
              translate('commonClose', 'Fechar')
          );
      } finally { 
          setSaving(false); 
      }
  };

  const handleRequestSave = async () => {
      let hardError = null;
      let focusTargetKey: string | null = null;
      let softWarningsList: string[] = [];
      const stockRunningBalances: Record<string, number> = {};

      const processQuestions = (questionsArray: any[], contextProdId: string | null = null) => {
          for (const p of questionsArray) {
              if (hardError) break;
              if (!isQuestionVisible(p, contextProdId || undefined)) continue;
              
              const isMandatory = checkSurveyIsMandatory(p);
              const answerKey = contextProdId ? `${p.id}::${contextProdId}` : p.id;
              const answer = answers[answerKey];
              const isAnswered = answer !== undefined && answer !== null && answer !== '' && (Array.isArray(answer) ? answer.length > 0 : true);
              
              const pTitle = String(p.titulo || p.texto || '').toLowerCase();
              
              const isDecimal = String(p.tipo).toUpperCase() === 'DECIMAL' || String(p.tipo).toUpperCase() === 'MOEDA' || pTitle.includes('preço') || pTitle.includes('preco');
              const isNumber = String(p.tipo).toUpperCase() === 'NUMERO' || isDecimal;
              
              let validacao = p.validacao || {};
              const prodContext = contextProdId ? produtosDoMix.find(prod => String(prod.id) === String(contextProdId)) : null;
              const itemLabel = prodContext ? `(${prodContext.nome})` : '';

              if (!isAnswered && isMandatory) { 
                  setErrorKey(answerKey); focusTargetKey = answerKey;
                  hardError = translate(
                      'surveyRequiredQuestion',
                      'A pergunta "{{question}}" é obrigatória. {{item}}',
                      { question: p.titulo || p.texto || '', item: itemLabel }
                  ); 
                  break; 
              }

              if (isAnswered && (validacao.foto_por_opcao === true || validacao.fotoPorOpcao === true)) {
                  const ops = Array.isArray(answer) ? answer : [answer];

                  for (const op of ops) {
                      const fotoKey = `${answerKey}::foto_${op}`;
                      const fotosOp = photosRef.current[fotoKey] || [];

                      if (fotosOp.length === 0) {
                          setErrorKey(answerKey);
                          focusTargetKey = answerKey;
                          hardError = translate(
                              'surveyRequiredOptionPhoto',
                              'A foto para a opção "{{option}}" é obrigatória. {{item}}',
                              { option: op, item: itemLabel }
                          );
                          break;
                      }
                  }

                  if (hardError) break;
              }

              if (isAnswered) {
                  const acaoEstoque = getStockActionFromQuestion(p);

                  if (acaoEstoque) {
                      const quantidade = parseNumericValue(answer);

                      if (isNaN(quantidade)) {
                          setErrorKey(answerKey);
                          focusTargetKey = answerKey;
                          hardError = translate(
                              'stockValidationInvalidQuantity',
                              'Informe uma quantidade válida para movimentar estoque. {{item}}',
                              { item: itemLabel }
                          );
                          break;
                      }

                      if (quantidade < 0) {
                          setErrorKey(answerKey);
                          focusTargetKey = answerKey;
                          hardError = translate(
                              'stockValidationNegativeQuantity',
                              'A quantidade de estoque não pode ser negativa. {{item}}',
                              { item: itemLabel }
                          );
                          break;
                      }

                      const targetProduct = resolveStockTargetProduct(acaoEstoque, contextProdId);
                      const targetContext = prodContext || targetProduct;
                      const stockKey = buildStockMovementKey(acaoEstoque, targetContext, contextProdId);

                      if (stockRunningBalances[stockKey] === undefined) {
                          stockRunningBalances[stockKey] = getInitialStockBalance(acaoEstoque, targetContext, contextProdId);
                      }

                      const saldoAnterior = stockRunningBalances[stockKey];
                      const saldoPosterior = getStockEffect(saldoAnterior, quantidade, acaoEstoque.operacao);

                      if (!acaoEstoque.permitirSaldoNegativo && saldoPosterior < 0) {
                          setErrorKey(answerKey);
                          focusTargetKey = answerKey;
                          const nomeItem = targetContext?.nome || targetContext?.name || targetContext?.descricao || acaoEstoque.chave || 'estoque';
                          hardError = translate(
                              'stockValidationInsufficientBalance',
                              'Saldo insuficiente para "{{item}}".\n\nSaldo atual: {{current}}.\nSaída solicitada: {{requested}}.\n\nNão é permitido deixar estoque negativo.',
                              { item: nomeItem, current: saldoAnterior, requested: quantidade }
                          );
                          break;
                      }

                      stockRunningBalances[stockKey] = saldoPosterior;
                  }
              }

              if (isAnswered && isNumber) {
                  const num = parseNumericValue(answer);

                  // 🎯 LENDO AS EXPRESSÕES CUSTOMIZADAS {{valor}}
                  if (validacao.expressao_customizada) {
                      const isValid = evaluateMobileFormula(validacao.expressao_customizada, prodContext, answer, visita);
                      if (!isValid) {
                          let msg = validacao.mensagem_erro_customizada || translate('surveyCustomRuleDefaultError', 'O valor informado está fora da regra esperada.');
                          if (validacao.permite_fura_bloqueio) {
                              softWarningsList.push(`• ${p.titulo || p.texto}: ${msg} ${itemLabel}`);
                          } else {
                              setErrorKey(answerKey); focusTargetKey = answerKey; hardError = msg + `\n\n${itemLabel}`; break;
                          }
                      }
                  } else {
                      let min = validacao.min !== undefined && validacao.min !== '' ? parseNumericValue(validacao.min) : undefined;
                      let max = validacao.max !== undefined && validacao.max !== '' ? parseNumericValue(validacao.max) : undefined;

                      if (prodContext) {
                          if (validacao.usar_min_do_produto === true || String(validacao.usar_min_do_produto) === 'true' || isDecimal) {
                              if (prodContext.preco_minimo !== undefined && prodContext.preco_minimo !== null && String(prodContext.preco_minimo) !== '') {
                                  min = parseNumericValue(prodContext.preco_minimo);
                              }
                          }
                          if (validacao.usar_max_do_produto === true || String(validacao.usar_max_do_produto) === 'true' || isDecimal) {
                              if (prodContext.preco_maximo !== undefined && prodContext.preco_maximo !== null && String(prodContext.preco_maximo) !== '') {
                                  max = parseNumericValue(prodContext.preco_maximo);
                              }
                          }
                      }

                      if (min !== undefined && !isNaN(min) && num < min) {
                          let msg = validacao.mensagem_erro_customizada || translate(
                              'surveyMinValueError',
                              'Valor muito baixo. Mínimo exigido: R$ {{value}}.',
                              { value: min.toFixed(2).replace('.', ',') }
                          );
                          if (validacao.permite_fura_bloqueio) {
                              softWarningsList.push(`• ${p.titulo || p.texto}: ${msg} ${itemLabel}`);
                          } else {
                              setErrorKey(answerKey); focusTargetKey = answerKey; hardError = msg + `\n\n${itemLabel}`; break;
                          }
                      }
                      
                      if (max !== undefined && !isNaN(max) && num > max) {
                          let msg = validacao.mensagem_erro_customizada || translate(
                              'surveyMaxValueError',
                              'Valor muito alto. Máximo permitido: R$ {{value}}.',
                              { value: max.toFixed(2).replace('.', ',') }
                          );
                          if (validacao.permite_fura_bloqueio) {
                              softWarningsList.push(`• ${p.titulo || p.texto}: ${msg} ${itemLabel}`);
                          } else {
                              setErrorKey(answerKey); focusTargetKey = answerKey; hardError = msg + `\n\n${itemLabel}`; break;
                          }
                      }
                  }
              }
          }
      };

      for (const section of surveySections) {
          if (hardError) break;
          const isGroupVisibleGlobally = section.group ? (section.group.escopo === 'PRODUTO' ? produtosDoMix.some(prod => isQuestionVisible(section.group, prod.id)) : isQuestionVisible(section.group)) : true;
          if (!isGroupVisibleGlobally) continue;

          processQuestions(section.globals);
          if (hardError) break;

          if (section.products.length > 0 && sortedProdutosDoMix.length > 0) {
              for (const prod of sortedProdutosDoMix) {
                  if (section.group && !shouldShowProductForQuestion(section.group, prod)) continue;
                  if (!isQuestionVisible(section.group || {}, prod.id)) continue;
                  
                  processQuestions(section.products, prod.id);
                  if (hardError) break;
              }
          }
      }

      if (hardError) {
          showCustomAlert(
              'error',
              translate('stockValidationBlockTitle', 'Bloqueio de validação'),
              hardError,
              undefined,
              () => {
                  closeCustomAlert();
                  if (focusTargetKey) scrollToError(focusTargetKey);
              },
              translate('understoodBtn', 'Entendi'),
              translate('stockValidationFixAnswer', 'Corrigir resposta')
          );
          return;
      }

      // 🎯 MODAL AMARELO COM DUAS OPÇÕES PARA FURA-BLOQUEIO
      if (softWarningsList.length > 0) {
          showCustomAlert(
              'warning', 
              translate('validationValuesAttentionTitle', 'Atenção aos valores'), 
              translate(
                  'validationValuesAttentionMessage',
                  'Existem {{count}} aviso(s) nas suas respostas:\n\n{{warning}}\n\nDeseja revisar ou enviar assim mesmo?',
                  { count: softWarningsList.length, warning: softWarningsList[0] }
              ),
              processSaveAction, 
              () => {
                  closeCustomAlert();
                  if (focusTargetKey) scrollToError(focusTargetKey);
              }, 
              translate('validationSendAnyway', 'Enviar mesmo assim'), 
              translate('validationReview', 'Revisar')
          );
          return;
      }

      processSaveAction(); 
  };

  const renderInputUI = (pergunta: any, answerKey: string) => {
      const tipo = String(pergunta.tipo || 'TEXTO').toUpperCase();
      const isPhoto = tipo === 'FOTO';
      const isDecimal = ['DECIMAL', 'MOEDA'].includes(tipo) || pergunta.titulo?.toLowerCase().includes('preço') || pergunta.texto?.toLowerCase().includes('preço');
      const isNumber = ['NUMERO', 'NUMBER', 'INTEIRO', 'INTEGER'].includes(tipo) || isDecimal;
      const isText = ['TEXTO', 'TEXT', 'SHORT_TEXT', 'LONG_TEXT'].includes(tipo);
      const isMultipla = ['MULTIPLA', 'CHECKBOX', 'MULTIPLE_CHOICE', 'MULTIPLA_ESCOLHA'].includes(tipo);
      const isExplicitSelection = ['SELECAO', 'DROPDOWN', 'RADIO', 'SINGLE_CHOICE', 'UNICA_ESCOLHA'].includes(tipo);
      const isProductSelection = ['PRODUTO', 'PRODUCT'].includes(tipo);

      const rawOptions = parseOptionsForMobile(pergunta.opcoes);
      const usesDynamicProducts = rawOptions.some(isDynamicProductOption);
      const canUseProductOptions = isExplicitSelection || isMultipla || isProductSelection || usesDynamicProducts;
      const productOptions = canUseProductOptions ? buildProductOptionsForQuestion(pergunta) : [];

      const rawOptionObjects = (usesDynamicProducts || isProductSelection)
          ? productOptions
          : (
              rawOptions.length > 0
                  ? rawOptions.map((op: any) => ({ label: String(op), value: String(op) }))
                  : productOptions
            );

      const optionObjects = shouldSortChoiceOptions(rawOptions, productOptions, rawOptionObjects, tipo)
          ? sortOptionObjectsAlphabetically(rawOptionObjects)
          : rawOptionObjects;

      const opcoesArr = optionObjects.map((op: any) => op.value);
      const isSelecao = isExplicitSelection || isProductSelection || (!isPhoto && !isNumber && !isText && !isMultipla && opcoesArr.length > 0);
      const validacao = pergunta.validacao || {};
      const hasPhotoByOption = validacao.foto_por_opcao === true || validacao.fotoPorOpcao === true;

      const currentPhotos = Array.isArray(answers[answerKey]) ? answers[answerKey] : (answers[answerKey] ? [answers[answerKey]] : []);
      const hasError = errorKey === answerKey;

      if (isPhoto) {
          return (
              <View style={styles.photoContainer} onLayout={(e) => { layoutRefs.current[answerKey] = e.nativeEvent.layout.y; }}>
                  {currentPhotos.length > 0 && (
                      <ScrollView horizontal style={styles.photosScrollList}>
                          {currentPhotos.map((uri: string, idx: number) => (
                              <View key={idx} style={[styles.photoWrapper, { borderColor: border }]}><Image source={{ uri }} style={styles.photoPreview} /><TouchableOpacity style={styles.removePhotoBtn} onPress={() => removePhoto(answerKey, idx)}><X size={14} color="white" /></TouchableOpacity></View>
                          ))}
                      </ScrollView>
                  )}
                  <TouchableOpacity style={[styles.photoBtn, { borderColor: border, backgroundColor: bg }]} onPress={() => handlePhotoRequest(pergunta, answerKey)}>
                      <View style={[styles.cameraIconBg, { backgroundColor: cardBg }]}><Camera size={24} color={accent} /></View>
                      <Text style={{ color: textSecondary, fontWeight: 'bold' }}>Tirar Foto</Text>
                  </TouchableOpacity>
              </View>
          );
      }

      if (isMultipla) {
          return (
              <View style={{ gap: 8 }} onLayout={(e) => { layoutRefs.current[answerKey] = e.nativeEvent.layout.y; }}>
                  {optionObjects.map((opcaoObj: any, idx: number) => {
                      const opcao = opcaoObj.value;
                      const label = opcaoObj.label || opcao;
                      const ansArr = Array.isArray(answers[answerKey]) ? answers[answerKey] : [];
                      const isChecked = ansArr.includes(opcao);
                      const photoKey = `${answerKey}::foto_${opcao}`;
                      const currentPhotosOp = Array.isArray(answers[photoKey]) ? answers[photoKey] : (answers[photoKey] ? [answers[photoKey]] : []);

                      return (
                          <View key={`${opcao}-${idx}`} style={{ marginBottom: 6 }}>
                              <TouchableOpacity style={[styles.checkboxItem, { backgroundColor: bg, borderColor: border }, isChecked && { borderColor: accent }]} onPress={() => {
                                  let newAns = [...ansArr];
                                  if (isChecked) newAns = newAns.filter(a => a !== opcao);
                                  else newAns.push(opcao);
                                  handleTextChange(answerKey, newAns);
                              }}>
                                  <View style={[styles.checkboxBox, { borderColor: textSecondary }, isChecked && { backgroundColor: accent, borderColor: accent, borderWidth: 0 }]}>{isChecked && <Check size={14} color="#fff" />}</View>
                                  <View style={{ flex: 1 }}>
                                      <Text style={{ fontSize: 15, color: isChecked ? textPrimary : textSecondary, fontWeight: isChecked ? '800' : '500' }}>{label}</Text>
                                      {opcaoObj.raw?.marca ? <Text style={{ fontSize: 11, color: textSecondary, marginTop: 2 }}>{opcaoObj.raw.marca}</Text> : null}
                                  </View>
                              </TouchableOpacity>

                              {isChecked && hasPhotoByOption ? (
                                  <View style={[styles.optionPhotoArea, { backgroundColor: bg, borderColor: border }]}>
                                      <Text style={[styles.optionPhotoLabel, { color: textSecondary }]}>
                                              {translate('surveyOptionPhotoLabel', 'Foto para "{{option}}"', { option: label })}
                                          </Text>
                                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosScrollList}>
                                          {currentPhotosOp.map((photoUri: string, pIdx: number) => (
                                              <View key={pIdx} style={[styles.photoWrapperMini, { borderColor: border }]}>
                                                  <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                                                  <TouchableOpacity style={styles.removePhotoBtn} onPress={() => removePhoto(photoKey, pIdx)}>
                                                      <X size={12} color="white" />
                                                  </TouchableOpacity>
                                              </View>
                                          ))}
                                          <TouchableOpacity style={[styles.photoBtnMini, { borderColor: accent }]} onPress={() => handlePhotoRequest(pergunta, answerKey, opcao)}>
                                              <Camera size={18} color={accent} />
                                              <Text style={[styles.photoBtnTextMini, { color: accent }]}>Foto da opção</Text>
                                          </TouchableOpacity>
                                      </ScrollView>
                                  </View>
                              ) : null}
                          </View>
                      );
                  })}
              </View>
          );
      }

      if (isSelecao) {
          const selectedOp = answers[answerKey];
          const selectedObj = optionObjects.find((op: any) => op.value === selectedOp);
          const selectedLabel = selectedObj?.label || selectedOp;
          const photoKey = selectedOp ? `${answerKey}::foto_${selectedOp}` : null;
          const currentPhotosOp = photoKey && answers[photoKey]
              ? (Array.isArray(answers[photoKey]) ? answers[photoKey] : [answers[photoKey]])
              : [];

          return (
              <View onLayout={(e) => { layoutRefs.current[answerKey] = e.nativeEvent.layout.y; }}>
                  <TouchableOpacity
                      activeOpacity={0.85}
                      style={[
                          styles.selectButton,
                          {
                              backgroundColor: bg,
                              borderColor: selectedOp ? accent : border,
                          },
                      ]}
                      onPress={() => openSelectionSheet(
                          pergunta.titulo || pergunta.texto || translate('surveySelectOptionTitle', 'Selecionar opção'),
                          answerKey,
                          optionObjects,
                          answers[answerKey] || ''
                      )}
                  >
                      <View style={{ flex: 1 }}>
                          <Text style={[styles.selectButtonLabel, { color: selectedOp ? textPrimary : textSecondary }]}>
                              {selectedOp ? selectedLabel : translate('surveySelectOptionPlaceholder', 'Selecione uma opção')}
                          </Text>
                          {selectedObj?.raw?.marca ? <Text style={[styles.selectButtonSubLabel, { color: textSecondary }]}>{selectedObj.raw.marca}</Text> : null}
                      </View>
                      <ChevronDown size={20} color={selectedOp ? accent : textSecondary} />
                  </TouchableOpacity>

                  {selectedOp && hasPhotoByOption ? (
                      <View style={[styles.optionPhotoArea, { backgroundColor: bg, borderColor: border }]}>
                          <Text style={[styles.optionPhotoLabel, { color: textSecondary }]}>
                               {translate('surveyOptionPhotoLabel', 'Foto para "{{option}}"', { option: selectedLabel })}
                           </Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosScrollList}>
                              {currentPhotosOp.map((photoUri: string, pIdx: number) => (
                                  <View key={pIdx} style={[styles.photoWrapperMini, { borderColor: border }]}>
                                      <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                                      <TouchableOpacity style={styles.removePhotoBtn} onPress={() => removePhoto(photoKey!, pIdx)}>
                                          <X size={12} color="white" />
                                      </TouchableOpacity>
                                  </View>
                              ))}
                              <TouchableOpacity style={[styles.photoBtnMini, { borderColor: accent }]} onPress={() => handlePhotoRequest(pergunta, answerKey, selectedOp)}>
                                  <Camera size={18} color={accent} />
                                  <Text style={[styles.photoBtnTextMini, { color: accent }]}>{translate('surveyAttachPhoto', 'Anexar foto')}</Text>
                              </TouchableOpacity>
                          </ScrollView>
                      </View>
                  ) : null}
              </View>
          );
      }

      return (
          <TextInput 
              onLayout={(e) => { layoutRefs.current[answerKey] = e.nativeEvent.layout.y; }}
              ref={(el) => { if (el) inputRefs.current[answerKey] = el; }} 
              style={[styles.input, { backgroundColor: bg, borderColor: border, color: textPrimary }, hasError && { borderColor: errorColor, borderWidth: 2 }]} 
              placeholder={isDecimal ? "0,00" : translate('surveyTextPlaceholder', 'Digite aqui...')} 
              placeholderTextColor={hasError ? errorColor : textSecondary} 
              keyboardType={isNumber ? 'numeric' : 'default'} 
              multiline={!isNumber} 
              value={answers[answerKey] || ''} 
              onChangeText={(text) => handleTextChange(answerKey, text, isDecimal)} 
          />
      );
  };

  if (loading) return <View style={[styles.center, { backgroundColor: bg }]}><ActivityIndicator size="large" color={accent} /></View>;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { backgroundColor: bg }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        
        <View style={[styles.header, { backgroundColor: cardBg, paddingTop: Math.max(insets.top, 40), borderBottomColor: border }]}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><ArrowLeft color={textPrimary} size={24} /></TouchableOpacity>
            <View>
                <Text style={[styles.headerTitle, { color: textPrimary }]} numberOfLines={1}>
                    {visita?.pesquisa_titulo_real || translate('surveyLabel', 'Pesquisa')}
                </Text>
                <Text style={{ color: textSecondary, fontSize: 12 }}>{visita?.loja_nome}</Text>
            </View>
        </View>

        <ScrollView ref={scrollViewRef} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
            {surveySections.map((section, sIdx) => {
                
                let isGroupVisibleGlobally = true;
                if (section.group) {
                    if (section.group.escopo === 'PRODUTO') {
                        isGroupVisibleGlobally = produtosDoMix.some(prod => isQuestionVisible(section.group, prod.id));
                    } else {
                        isGroupVisibleGlobally = isQuestionVisible(section.group);
                    }
                }
                
                if (!isGroupVisibleGlobally) return null;
                
                const isGroupCollapsed = section.group ? collapsedGroups.includes(section.group.id) : false;

                return (
                <View key={sIdx} style={{ marginBottom: 30 }}>
                    {section.group && (
                        <TouchableOpacity onPress={() => toggleGroupCollapse(section.group.id)} style={[styles.groupHeader, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF' }]}>
                            {isGroupCollapsed ? <ChevronRight size={20} color={accent} /> : <ChevronDown size={20} color={accent} />}
                            <FolderOpen size={20} color={accent} />
                            <Text style={[styles.groupTitle, { color: accent }]}>{section.group.titulo || section.group.texto}</Text>
                        </TouchableOpacity>
                    )}

                    {!isGroupCollapsed && (
                        <View style={section.group ? { paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: accent, marginLeft: 10 } : {}}>
                            
                            {section.globals.map((p: any) => {
                                if (!isQuestionVisible(p)) return null;
                                return (
                                    <View key={p.id} style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
                                        <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                                            <Text style={[styles.label, { color: textPrimary, flex: 1 }]}>{p.titulo || p.texto}</Text>
                                            {checkSurveyIsMandatory(p) && <Asterisk size={12} color={errorColor} />}
                                        </View>
                                        {renderInputUI(p, p.id)}
                                    </View>
                                )
                            })}

                            {section.products.length > 0 && sortedProdutosDoMix.length > 0 && (
                                <View style={{ marginTop: 10 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15 }}>
                                        <Package size={20} color={textSecondary} />
                                        <Text style={{ fontSize: 16, fontWeight: '800', color: textSecondary }}>{translate('surveyEvaluatedItems', 'ITENS AVALIADOS')}</Text>
                                    </View>

                                    {sortedProdutosDoMix.map((prod: any) => {
                                        
                                        if (section.group && !shouldShowProductForQuestion(section.group, prod)) return null;
                                        if (!isQuestionVisible(section.group || {}, prod.id)) return null;

                                        const visibleQuestions = section.products.filter((p: any) => isQuestionVisible(p, prod.id) && shouldShowProductForQuestion(p, prod));
                                        if (visibleQuestions.length === 0) return null;

                                        const productName = String(prod.nome || prod.name || prod.descricao || prod.description || prod.id || '');

                                        return (
                                            <View key={prod.id || productName} style={[styles.card, { backgroundColor: cardBg, borderColor: border, borderLeftWidth: 4, borderLeftColor: accent }]}>
                                                <View style={styles.prodHeader}>
                                                    <Package size={18} color={accent} />
                                                    <Text style={[styles.prodName, { color: textPrimary }]}>{productName}</Text>
                                                </View>
                                                
                                                {visibleQuestions.map((p: any) => (
                                                    <View key={p.id} style={{ marginTop: 15 }}>
                                                        <View style={{ flexDirection: 'row', marginBottom: 5 }}>
                                                            <Text style={[styles.labelSmall, { color: textPrimary, flex: 1 }]}>{p.titulo || p.texto}</Text>
                                                            {checkSurveyIsMandatory(p) && <Asterisk size={10} color={errorColor} />}
                                                        </View>
                                                        {renderInputUI(p, `${p.id}::${prod.id}`)}
                                                    </View>
                                                ))}
                                            </View>
                                        );
                                    })}
                                </View>
                            )}
                        </View>
                    )}
                </View>
            )})}
            
            {perguntas.length === 0 && (
                <View style={styles.center}>
                    <Text style={{ color: textSecondary }}>{translate('surveyNoQuestionsAvailable', 'Sem perguntas disponíveis.')}</Text>
                </View>
            )}
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: cardBg, borderTopColor: border, paddingBottom: insets.bottom + 10 }]}>
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: accent }]} onPress={handleRequestSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#FFF" /> : (
                    <>
                        <Save size={20} color="#FFF" />
                        <Text style={styles.saveBtnText}>{translate('surveyFinishButton', 'FINALIZAR PESQUISA')}</Text>
                    </>
                )}
            </TouchableOpacity>
        </View>

        {watermarkJob && (
            <View pointerEvents="none" style={styles.watermarkCanvas}>
                <View ref={watermarkRef} collapsable={false} style={styles.watermarkFrame}>
                    <Image source={{ uri: watermarkJob.uri }} style={styles.watermarkImage} onLoad={handleWatermarkImageLoaded} />
                    <View style={styles.watermarkOverlay}>
                        <Text style={styles.watermarkText}>{watermarkJob.text}</Text>
                    </View>
                </View>
            </View>
        )}

        {/* 🚀 MODAL PREMIUM CUSTOMIZADO */}
        <Modal visible={customAlert.visible} transparent animationType="fade">
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    {customAlert.type === 'error' && <XCircle size={50} color="#ef4444" style={styles.modalIcon} />}
                    {customAlert.type === 'warning' && <AlertTriangle size={50} color="#f59e0b" style={styles.modalIcon} />}
                    {customAlert.type === 'success' && <CheckCircle2 size={50} color="#10b981" style={styles.modalIcon} />}
                    
                    <Text style={styles.modalTitle}>{customAlert.title}</Text>
                    <Text style={styles.modalMessage}>{customAlert.message}</Text>
                    
                    <View style={styles.modalActions}>
                        {customAlert.onCancel && (
                            <TouchableOpacity style={styles.modalBtnCancel} onPress={customAlert.onCancel}>
                                <Text style={styles.modalBtnCancelText}>{customAlert.cancelText || translate('cancel', 'Cancelar')}</Text>
                            </TouchableOpacity>
                        )}
                        {customAlert.onConfirm ? (
                            <TouchableOpacity style={[styles.modalBtnConfirm, customAlert.type === 'error' && {backgroundColor: '#ef4444'}, customAlert.type === 'warning' && {backgroundColor: '#f59e0b'}, customAlert.type === 'success' && {backgroundColor: '#10b981'}]} onPress={customAlert.onConfirm}>
                                <Text style={styles.modalBtnConfirmText}>{customAlert.confirmText || translate('commonOk', 'OK')}</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity style={[styles.modalBtnConfirm, customAlert.type === 'error' && {backgroundColor: '#ef4444'}, customAlert.type === 'warning' && {backgroundColor: '#f59e0b'}, customAlert.type === 'success' && {backgroundColor: '#10b981'}]} onPress={closeCustomAlert}>
                                <Text style={styles.modalBtnConfirmText}>{customAlert.confirmText || translate('understoodBtn', 'Entendi')}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>
        </Modal>



        <Modal visible={selectionSheet.visible} transparent animationType="fade" onRequestClose={closeSelectionSheet}>
            <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={closeSelectionSheet}>
                <TouchableOpacity
                    activeOpacity={1}
                    style={[styles.sheetCard, { backgroundColor: cardBg, borderColor: border }]}
                    onPress={(event) => event.stopPropagation()}
                >
                    <View style={styles.sheetHandle} />
                    <View style={styles.sheetHeader}>
                        <Text style={[styles.sheetTitle, { color: textPrimary }]} numberOfLines={2}>{selectionSheet.title}</Text>
                        <TouchableOpacity style={[styles.sheetCloseBtn, { backgroundColor: bg }]} onPress={closeSelectionSheet}>
                            <X size={18} color={textSecondary} />
                        </TouchableOpacity>
                    </View>

                    {selectionSheet.options.length > 8 && (
                        <TextInput
                            value={selectionSheet.search}
                            onChangeText={(value) => setSelectionSheet(prev => ({ ...prev, search: value }))}
                            placeholder={translate('surveySearchOptionPlaceholder', 'Buscar opção...')}
                            placeholderTextColor={textSecondary}
                            style={[styles.sheetSearchInput, { backgroundColor: bg, borderColor: border, color: textPrimary }]}
                            autoCorrect={false}
                            autoCapitalize="none"
                        />
                    )}

                    <ScrollView style={styles.sheetOptionsScroll} showsVerticalScrollIndicator={false}>
                        {selectionSheet.options
                            .filter((option) => {
                                const term = normalizeOptionSortText(selectionSheet.search);
                                if (!term) return true;
                                return normalizeOptionSortText(`${option.label || option.value} ${option.raw?.marca || ''} ${option.raw?.categoria || ''} ${option.raw?.subcategoria || ''}`).includes(term);
                            })
                            .map((option, index) => {
                            const selected = String(selectionSheet.selectedValue || '') === String(option.value);
                            return (
                                <TouchableOpacity
                                    key={`${option.value}-${index}`}
                                    activeOpacity={0.85}
                                    style={[
                                        styles.sheetOption,
                                        { backgroundColor: selected ? 'rgba(59,130,246,0.10)' : bg, borderColor: selected ? accent : border },
                                    ]}
                                    onPress={() => selectOptionFromSheet(option)}
                                >
                                    <View style={[styles.sheetRadio, { borderColor: selected ? accent : textSecondary, backgroundColor: selected ? accent : 'transparent' }]}> 
                                        {selected ? <Check size={13} color="#FFF" /> : null}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.sheetOptionText, { color: selected ? accent : textPrimary }]}>{option.label || option.value}</Text>
                                        {option.raw?.marca ? <Text style={[styles.sheetOptionSubText, { color: textSecondary }]}>{option.raw.marca}</Text> : null}
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  backBtn: { marginRight: 15 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, marginBottom: 15 },
  groupTitle: { fontSize: 14, fontWeight: 'bold', textTransform: 'uppercase' },
  card: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 12, elevation: 1 },
  label: { fontSize: 16, fontWeight: 'bold' },
  labelSmall: { fontSize: 13, fontWeight: 'bold' },
  prodHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingBottom: 10 },
  prodName: { fontSize: 16, fontWeight: '900' },
  input: { height: 48, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 15 },
  pickerContainer: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  selectButton: { minHeight: 56, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 15, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectButtonLabel: { fontSize: 15, fontWeight: '800' },
  selectButtonSubLabel: { fontSize: 11, marginTop: 3, fontWeight: '600' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'flex-end' },
  sheetCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 24, maxHeight: '78%' },
  sheetHandle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 99, backgroundColor: 'rgba(148, 163, 184, 0.55)', marginBottom: 14 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: '900', lineHeight: 22 },
  sheetCloseBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sheetOptionsScroll: { maxHeight: 430 },
  sheetSearchInput: { height: 46, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, fontSize: 14, fontWeight: '700', marginBottom: 12 },
  sheetOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 10 },
  sheetRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  sheetOptionText: { fontSize: 15, fontWeight: '800' },
  sheetOptionSubText: { fontSize: 11, marginTop: 3, fontWeight: '600' },
  checkboxItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1 },
  checkboxBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  photoContainer: { marginTop: 4 },
  photoBtn: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  cameraIconBg: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  photosScrollList: { flexDirection: 'row' },
  photoWrapper: { width: 100, height: 130, marginRight: 12, borderRadius: 12, borderWidth: 1, position: 'relative' },
  photoPreview: { width: '100%', height: '100%', borderRadius: 11 },
  optionPhotoArea: {
    marginTop: 8,
    marginLeft: 34,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  optionPhotoLabel: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
  },
  photoWrapperMini: {
    position: 'relative',
    width: 72,
    height: 72,
    marginRight: 10,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'visible',
  },
  photoBtnMini: {
    width: 92,
    height: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  photoBtnTextMini: {
    fontSize: 10,
    fontWeight: '900',
    marginTop: 4,
    textAlign: 'center',
  },
  removePhotoBtn: { position: 'absolute', top: -8, right: -8, backgroundColor: '#ef4444', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  footer: { padding: 20, borderTopWidth: 1 },
  saveBtn: { height: 54, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  saveBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  
  // Estilos do Novo Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: '#fff', borderRadius: 24, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 10 },
  modalIcon: { marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#1e293b', marginBottom: 8, textAlign: 'center' },
  modalMessage: { fontSize: 15, color: '#64748b', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  watermarkCanvas: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 360,
    height: 480,
    opacity: 0.02,
    zIndex: -1,
  },
  watermarkFrame: {
    width: 360,
    height: 480,
    backgroundColor: '#000',
  },
  watermarkImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  watermarkOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  watermarkText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '900',
  },
  modalActions: { flexDirection: 'row', gap: 12, width: '100%' },
  modalBtnCancel: { flex: 1, height: 50, borderRadius: 12, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  modalBtnCancelText: { color: '#475569', fontWeight: 'bold', fontSize: 15 },
  modalBtnConfirm: { flex: 1, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  modalBtnConfirmText: { color: '#fff', fontWeight: 'bold', fontSize: 15 }
});