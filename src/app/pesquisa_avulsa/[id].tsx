import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle2, Circle, Camera, CheckSquare, Square, Save, AlertCircle, ClipboardCheck, X } from 'lucide-react-native';
import { addAppLog, getDBConnection } from '../../database/db';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useAuthStore } from '../../store/useAuthStore';
import { globalSync, addToSyncQueue } from '../../services/syncService';
import { api } from '../../services/api';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { captureRef } from 'react-native-view-shot';
import { t } from '../../utils/i18n';
import { getSmartLocation, getFastPhotoLocation } from '../../services/locationService';


const safeParseArray = (data: any) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;

  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === 'string') return safeParseArray(parsed);
    } catch {}
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
    } catch {}
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

const parseOptions = (value: any) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) return [];

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed
        .substring(1, trimmed.length - 1)
        .split(',')
        .map((o: string) => o.trim())
        .filter(Boolean);
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {}

    return trimmed.split(',').map((o: string) => o.trim()).filter(Boolean);
  }

  return [];
};

const normalizeQuestion = (p: any) => {
  let validacao = p.validacao || p.validacoes || {};
  if (typeof validacao === 'string') {
    try { validacao = JSON.parse(validacao); } catch { validacao = {}; }
  }

  let filtrosProduto = p.filtroProduto || p.filtros_produto || p.filtro_produto || {};
  if (typeof filtrosProduto === 'string') {
    try { filtrosProduto = JSON.parse(filtrosProduto); } catch { filtrosProduto = {}; }
  }

  const rawTipo = String(p.tipo || 'TEXTO').toUpperCase();
  const tipo = ['INTEGER', 'INTEIRO'].includes(rawTipo) ? 'NUMERO' : rawTipo;

  return {
    ...p,
    tipo,
    texto: p.texto || p.titulo || p.pergunta || 'Pergunta não definida',
    opcoes: parseOptions(p.opcoes || p.options),
    validacao: {
      ...validacao,
      obrigatorio: isTruthy(p.obrigatorio) || isTruthy(p.obrigatoria) || isTruthy(validacao.obrigatorio),
      foto_por_opcao: isTruthy(validacao.foto_por_opcao) || isTruthy(validacao.fotoPorOpcao),
      fotoPorOpcao: isTruthy(validacao.fotoPorOpcao) || isTruthy(validacao.foto_por_opcao),
      multiplas_fotos_por_opcao: isTruthy(validacao.multiplas_fotos_por_opcao) || isTruthy(validacao.multiplasFotosPorOpcao),
      multiplasFotosPorOpcao: isTruthy(validacao.multiplasFotosPorOpcao) || isTruthy(validacao.multiplas_fotos_por_opcao),
      max_fotos_por_opcao: validacao.max_fotos_por_opcao ?? validacao.maxFotosPorOpcao,
      maxFotosPorOpcao: validacao.maxFotosPorOpcao ?? validacao.max_fotos_por_opcao,
      multiplasFotos: isTruthy(validacao.multiplasFotos) || isTruthy(validacao.multiplas_fotos),
      multiplas_fotos: isTruthy(validacao.multiplas_fotos) || isTruthy(validacao.multiplasFotos),
      maxFotos: validacao.maxFotos ?? validacao.max_fotos,
      max_fotos: validacao.max_fotos ?? validacao.maxFotos,
    },
    filtros_produto: filtrosProduto || {},
    filtroProduto: filtrosProduto || {},
  };
};

const checkQuestionIsMandatory = (pergunta: any) => {
  return isTruthy(pergunta?.obrigatorio) ||
    isTruthy(pergunta?.obrigatoria) ||
    isTruthy(pergunta?.validacao?.obrigatorio);
};



const normalizePolicyText = (value: any) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

const getPhotoOrientationPolicy = (pergunta: any, fallback?: any) => {
  const v = pergunta?.validacao || {};
  const raw = v.orientacaoFoto || v.orientacao || v.photoOrientation || v.photo_orientation || fallback || 'ANY';
  const normalized = normalizePolicyText(raw);

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

const getTaskPhotoConfig = (taskObj: any) => {
  const raw = safeParseObject(taskObj?.task_raw_json);
  const projectConfig = safeParseObject(taskObj?.project_config_json || taskObj?.projectConfigJson || raw?.project_config || raw?.projectConfig);
  const perfilMobile = safeParseObject(projectConfig?.perfil_mobile || raw?.perfil_mobile || raw?.perfilMobile);
  const nestedProject = safeParseObject(projectConfig?.project || perfilMobile?.project || raw?.project);

  const readBool = (...values: any[]) => values.some((value) => isTruthy(value));

  return {
    blockGallery: readBool(
      taskObj?.blockGallery,
      taskObj?.disableGallery,
      taskObj?.block_gallery,
      taskObj?.disable_gallery,
      raw?.blockGallery,
      raw?.disableGallery,
      raw?.block_gallery,
      raw?.disable_gallery,
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
      taskObj?.forceLiveCamera,
      taskObj?.force_live_camera,
      raw?.forceLiveCamera,
      raw?.force_live_camera,
      projectConfig?.forceLiveCamera,
      projectConfig?.force_live_camera,
      nestedProject?.forceLiveCamera,
      nestedProject?.force_live_camera
    ),
    watermarkPhotos: readBool(
      taskObj?.watermarkPhotos,
      taskObj?.watermark_photos,
      taskObj?.watermark,
      raw?.watermarkPhotos,
      raw?.watermark_photos,
      raw?.watermark,
      projectConfig?.watermarkPhotos,
      projectConfig?.watermark_photos,
      projectConfig?.watermark,
      nestedProject?.watermarkPhotos,
      nestedProject?.watermark_photos,
      nestedProject?.watermark
    ),
    defaultOrientation:
      projectConfig?.photoOrientation ||
      projectConfig?.photo_orientation ||
      nestedProject?.photoOrientation ||
      nestedProject?.photo_orientation ||
      raw?.photoOrientation ||
      'ANY',
  };
};


// OMNI_GENERAL_REPEATABLE_V3

const repeatableMobileText = (
  language: any,
  pt: string,
  en: string,
  es: string
) => {
  if (language === 'en-US') return en;
  if (language === 'es-ES') return es;
  return pt;
};

const repeatableTruthy = (value: any) => {
  if (value === true) return true;

  const normalized =
    String(value || '')
      .trim()
      .toLowerCase();

  return [
    'true',
    '1',
    'sim',
    'yes',
    's',
    'y'
  ].includes(normalized);
};

const repeatableObject = (value: any) => {
  if (!value) return {};

  if (
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      const parsed =
        JSON.parse(value);

      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed)
      ) {
        return parsed;
      }
    } catch {}
  }

  return {};
};

const repeatableTaskIsRepeatable = (
  taskObj: any,
  questions: any[]
) => {
  const raw =
    repeatableObject(
      taskObj?.task_raw_json
    );

  if (
    repeatableTruthy(taskObj?.repetivel) ||
    repeatableTruthy(taskObj?.repeatable) ||
    repeatableTruthy(raw?.repetivel) ||
    repeatableTruthy(raw?.repeatable)
  ) {
    return true;
  }

  const scanQuestions = (
    list: any[]
  ): boolean => {
    for (const question of list || []) {
      const validation =
        repeatableObject(
          question?.validacao ||
          question?.validacoes
        );

      if (
        repeatableTruthy(question?.repetivel) ||
        repeatableTruthy(question?.repeatable) ||
        repeatableTruthy(validation?.repetivel) ||
        repeatableTruthy(validation?.repeatable)
      ) {
        return true;
      }

      const children =
        question?.perguntas ||
        question?.questions ||
        question?.questoes ||
        question?.children ||
        question?.itens;

      if (
        Array.isArray(children) &&
        scanQuestions(children)
      ) {
        return true;
      }
    }

    return false;
  };

  return scanQuestions(
    questions || []
  );
};

const repeatableContext = (
  taskObj: any,
  routeId: any,
  user: any
) => {
  const raw =
    repeatableObject(
      taskObj?.task_raw_json
    );

  const pesquisaId =
    String(
      taskObj?.pesquisa_id ||
      taskObj?.pesquisaId ||
      raw?.pesquisa_id ||
      raw?.pesquisaId ||
      raw?.id ||
      routeId ||
      ''
    )
      .replace(/^task-/, '')
      .trim();

  const projectId =
    user?.allowed_project_ids?.[0] ||
    user?.allowedProjectIds?.[0] ||
    user?.projectId ||
    user?.project_id ||
    user?.projeto_id ||
    taskObj?.projectId ||
    taskObj?.project_id ||
    raw?.projectId ||
    raw?.project_id ||
    '';

  const usuarioId =
    user?.id ||
    taskObj?.usuario_id ||
    taskObj?.usuarioId ||
    raw?.usuario_id ||
    raw?.usuarioId ||
    '';

  const dataProgramada =
    String(
      taskObj?.data_programada ||
      taskObj?.dataProgramada ||
      raw?.data_programada ||
      raw?.dataProgramada ||
      taskObj?.data_vencimento ||
      raw?.data_vencimento ||
      new Date()
        .toISOString()
        .substring(0, 10)
    )
      .substring(0, 10);

  return {
    pesquisaId,
    projectId:
      String(projectId),
    usuarioId:
      String(usuarioId),
    dataProgramada
  };
};

export default function PesquisaAvulsaScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const settings = useSettingsStore() as any;
  const { theme } = settings;
  const language = settings.language || 'pt-BR';
  const isDark = theme === 'dark';

  const bg = isDark ? '#0B0F19' : '#F4F7FC';
  const cardBg = isDark ? '#151A27' : '#FFFFFF';
  const textPrimary = isDark ? '#FFFFFF' : '#1E293B';
  const textSecondary = isDark ? '#8F9BB3' : '#64748B';
  const accent = '#FF7A00';
  const border = isDark ? '#1E293B' : '#E2E8F0';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [
    generalRepeatableStatus,
    setGeneralRepeatableStatus
  ] = useState<any>(null);
  const [task, setTask] = useState<any>(null);
  const [perguntas, setPerguntas] = useState<any[]>([]);
  const [respostas, setRespostas] = useState<Record<string, any>>({});
  const [produtosDoMix, setProdutosDoMix] = useState<any[]>([]);
  const photosRef = useRef<Record<string, any[]>>({});
  const watermarkRef = useRef<View>(null);
  const watermarkResolverRef = useRef<{
    resolve: (value: { uri: string; base64: string }) => void;
    reject: (error: any) => void;
  } | null>(null);
  const [watermarkJob, setWatermarkJob] = useState<{ uri: string; text: string; width: number; height: number } | null>(null);

  const isStandaloneRepeatable =
    useMemo(
      () =>
        repeatableTaskIsRepeatable(
          task,
          perguntas
        ),
      [task, perguntas]
    );

  const repeatableClosed =
    generalRepeatableStatus
      ?.closed === true ||
    generalRepeatableStatus
      ?.blocked === true;

  const repeatableAtLimit =
    isStandaloneRepeatable &&
    generalRepeatableStatus?.max !== null &&
    generalRepeatableStatus?.max !== undefined &&
    Number(generalRepeatableStatus?.max) > 0 &&
    Number(generalRepeatableStatus?.currentCount || 0) >=
      Number(generalRepeatableStatus?.max);

  const refreshGeneralRepeatableStatus =
    async (
      taskOverride?: any
    ) => {
      const currentTask =
        taskOverride ||
        task;

      if (!currentTask) {
        return null;
      }

      const authUser =
        useAuthStore
          .getState()
          .user;

      const ctx =
        repeatableContext(
          currentTask,
          id,
          authUser
        );

      if (
        !ctx.projectId ||
        !ctx.usuarioId ||
        !ctx.pesquisaId
      ) {
        return null;
      }

      try {
        const query =
          new URLSearchParams();

        query.set(
          'projectId',
          ctx.projectId
        );

        query.set(
          'pesquisaId',
          ctx.pesquisaId
        );

        query.set(
          'usuarioId',
          ctx.usuarioId
        );

        query.set(
          'dataProgramada',
          ctx.dataProgramada
        );

        const response =
          await api(
            '/coletas/general-repeatable-status?' +
            query.toString()
          );

        if (!response.ok) {
          return null;
        }

        const data =
          await response.json();

        const status = {
          currentCount:
            Number(
              data?.currentCount || 0
            ),

          closed:
            data?.closed === true,

          blocked:
            data?.blocked === true,

          min:
            Number(
              data?.min || 1
            ),

          max:
            data?.max === null ||
            data?.max === undefined
              ? null
              : Number(data.max)
        };

        setGeneralRepeatableStatus(
          status
        );

        return status;
      } catch {
        return null;
      }
    };


  useEffect(() => {
    if (id) loadTask();
  }, [id]);

  useEffect(() => {
    if (
      !task ||
      !isStandaloneRepeatable
    ) {
      return;
    }

    void (
      async () => {
        const status =
          await refreshGeneralRepeatableStatus();

        if (!status) {
          return;
        }

        const localStatus =
          status.closed
            ? 'REALIZADA'
            : Number(status.currentCount || 0) > 0
              ? 'EM_ANDAMENTO'
              : 'PENDENTE';

        try {
          const db =
            await getDBConnection();

          await db.runAsync(
            `UPDATE other_tasks
                SET status = ?,
                    updated_at = ?
              WHERE id = ?`,
            [
              localStatus,
              new Date()
                .toISOString(),
              String(id)
            ]
          );

          setTask(
            (prev: any) => ({
              ...prev,
              status:
                localStatus
            })
          );
        } catch {}
      }
    )();
  }, [
    task?.id,
    isStandaloneRepeatable
  ]);

  const loadTask = async () => {
    try {
      const db = await getDBConnection();
      const res = await db.getAllAsync(`SELECT * FROM other_tasks WHERE id = ?`, [String(id)]) as any[];

      if (res && res.length > 0) {
        const taskData = res[0];
        setTask(taskData);

        let rawJson: any = {};
        try {
          rawJson = typeof taskData.task_raw_json === 'string' ? JSON.parse(taskData.task_raw_json || '{}') : (taskData.task_raw_json || {});
          if (typeof rawJson === 'string') rawJson = JSON.parse(rawJson);
        } catch {}

        let cleanPesquisaId = taskData.pesquisa_id || rawJson.pesquisa_id || rawJson.pesquisaId || rawJson.id || id;
        if (typeof cleanPesquisaId === 'string' && cleanPesquisaId.startsWith('task-')) {
          cleanPesquisaId = cleanPesquisaId.replace('task-', '');
        }

        let extracted: any[] = [];

        try {
          const bdPerguntas = await db.getAllAsync(`SELECT * FROM perguntas_pesquisas WHERE pesquisaId = ? ORDER BY ordem ASC`, [cleanPesquisaId]);
          if (bdPerguntas && bdPerguntas.length > 0) extracted = bdPerguntas;
        } catch {}

        if (extracted.length === 0) {
          if (Array.isArray(rawJson.pesquisa_json)) extracted = rawJson.pesquisa_json;
          else if (Array.isArray(rawJson.perguntas)) extracted = rawJson.perguntas;
          else if (Array.isArray(rawJson.questoes)) extracted = rawJson.questoes;
          else if (Array.isArray(rawJson.questions)) extracted = rawJson.questions;
        }

        setPerguntas(extracted.map(normalizeQuestion));

        let produtos = safeParseArray(taskData.produtos_json || rawJson.produtos_json || rawJson.produtos || rawJson.products);

        if (produtos.length === 0) {
          try {
            const hasProdutos = await db.getAllAsync(`SELECT name FROM sqlite_master WHERE type='table' AND name='produtos'`);
            if (hasProdutos?.length > 0) {
              produtos = await db.getAllAsync(`SELECT * FROM produtos`);
            }
          } catch {}
        }

        setProdutosDoMix(produtos || []);
      } else {
        Alert.alert('Erro', 'Tarefa não encontrada.');
        router.back();
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (perguntaId: string, valor: any) => {
    setRespostas(prev => ({ ...prev, [perguntaId]: valor }));
  };

  const toggleMultiSelect = (perguntaId: string, opcao: string) => {
    setRespostas(prev => {
      const atuais = prev[perguntaId] || [];
      if (atuais.includes(opcao)) {
        return { ...prev, [perguntaId]: atuais.filter((item: string) => item !== opcao) };
      } else {
        return { ...prev, [perguntaId]: [...atuais, opcao] };
      }
    });
  };

  const shouldShowProductForQuestion = (pergunta: any, prod: any) => {
    const f = pergunta.filtros_produto || pergunta.filtroProduto || {};
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

  const buildProductOptionsForQuestion = (pergunta: any) => {
    const f = pergunta.filtros_produto || pergunta.filtroProduto || {};
    const hasProductFilter = f && Object.keys(f).length > 0;
    const usesDynamicProducts = parseOptions(pergunta.opcoes).some(isDynamicProductOption);

    if (!hasProductFilter && !usesDynamicProducts) return [];

    return sortOptionObjectsAlphabetically(
      produtosDoMix
        .filter((prod) => shouldShowProductForQuestion(pergunta, prod))
        .map((prod) => ({
          label: String(prod.nome || prod.name || prod.descricao || prod.id),
          value: String(prod.nome || prod.name || prod.descricao || prod.id),
          productId: prod.id,
          raw: prod,
        }))
    );
  };

  // MOBILE_PHOTO_EVIDENCE_STRUCTURED_V3
  const buildWatermarkText = () => {
    /*
     * SOMENTE marca/contexto configurado.
     *
     * GPS e origem NÃO são desenhados na foto.
     */
    return (
      `${task?.titulo || 'Pesquisa'} • ` +
      `${new Date().toLocaleString()}`
    );
  };

  const applyWatermarkIfNeeded = async (
    asset: any
  ) => {
    const photoConfig =
      getTaskPhotoConfig(task);

    const originalPhoto = {
      uri:
        asset.uri,

      base64:
        `data:image/jpeg;base64,${asset.base64}`,
    };

    /*
     * Marca desligada:
     * fotografia original permanece intacta.
     */
    if (
      !photoConfig.watermarkPhotos
    ) {
      return originalPhoto;
    }

    const width =
      Number(asset?.width) > 0
        ? Number(asset.width)
        : 1080;

    const height =
      Number(asset?.height) > 0
        ? Number(asset.height)
        : 1440;

    /*
     * Marca ligada:
     * fotografia inteira +
     * faixa adicional ABAIXO da fotografia.
     *
     * Nada é desenhado sobre os pixels originais.
     */
    return new Promise<{
      uri: string;
      base64: string;
    }>((resolve, reject) => {
      watermarkResolverRef.current = {
        resolve,
        reject
      };

      setWatermarkJob({
        uri:
          asset.uri,

        text:
          buildWatermarkText(),

        width,
        height,
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
    const validacao = pergunta.validacao || {};
    const photoConfig = getTaskPhotoConfig(task);
    const isMultiple = isOptionPhoto
      ? validacao.multiplas_fotos_por_opcao === true || validacao.multiplasFotosPorOpcao === true
      : validacao.multiplasFotos === true || validacao.multiplas_fotos === true;

    const maxFotos = Number(isOptionPhoto ? (validacao.max_fotos_por_opcao ?? validacao.maxFotosPorOpcao) : (validacao.maxFotos ?? validacao.max_fotos)) || 0;
    const currentPhotos = photosRef.current[targetKey] || [];

    if (maxFotos > 0 && currentPhotos.length >= maxFotos) {
      Alert.alert('Aviso', `Limite de ${maxFotos} foto(s) atingido.`);
      return;
    }

    const requiredOrientation = getPhotoOrientationPolicy(pergunta, photoConfig.defaultOrientation);
    const orientationLabel = requiredOrientation === 'HORIZONTAL' ? 'horizontal/paisagem' : 'vertical/retrato';

    const processAsset = async (
      asset: any,
      source: 'CAMERA' | 'GALLERY',
      locationPromise?: Promise<any>
    ) => {
      if (!asset?.uri || !asset?.base64) return;

      if (!assetMatchesOrientation(asset, requiredOrientation)) {
        Alert.alert(
          'Orientação incorreta',
          `Esta foto precisa ser tirada na orientação ${orientationLabel}. Tire uma nova foto para continuar.`
        );
        return;
      }

      const gpsResult =
        await (
          locationPromise ||
          getFastPhotoLocation()
        );

      const latitude =
        Number(gpsResult?.latitude);

      const longitude =
        Number(gpsResult?.longitude);

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        Alert.alert(
          t('photoGpsRequiredTitle'),
          gpsResult?.error === 'FAKE_GPS'
            ? t('photoGpsFakeDetected')
            : t('photoGpsRequiredMessage')
        );

        return;
      }

      // PHOTO_ORIGINAL_NO_MOBILE_WATERMARK_V1
      const rawBase64 =
        String(asset.base64).startsWith('data:image')
          ? String(asset.base64)
          : `data:image/jpeg;base64,${asset.base64}`;

      // PHOTO_STRUCTURED_METADATA_V1
      const photoPayload = {
        /*
         * Preview usa diretamente o arquivo original.
         */
        uri:
          asset.uri,

        /*
         * Payload para upload.
         */
        base64:
          rawBase64,

        url:
          rawBase64,

        /*
         * Metadata técnica.
         * Nada disso é desenhado sobre a fotografia.
         */
        origin:
          source,

        capturedAt:
          new Date().toISOString(),

        latitude:
          latitude,

        longitude:
          longitude,
      };

      if (!photosRef.current[targetKey]) photosRef.current[targetKey] = [];

      if (isMultiple) photosRef.current[targetKey].push(photoPayload);
      else photosRef.current[targetKey] = [photoPayload];

      setRespostas(prev => ({
        ...prev,
        [targetKey]: photosRef.current[targetKey].map(p => p.uri),
      }));
    };

    const takePhoto = async () => {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permissão necessária', 'A câmera precisa estar liberada para tirar a foto.');
        return;
      }

      const locationPromise =
        getFastPhotoLocation();

      const res = await ImagePicker.launchCameraAsync({ quality: 0.2, base64: true });
      if (!res.canceled && res.assets?.[0]) await processAsset(
          res.assets[0],
          'CAMERA',
          locationPromise
        );
    };

    if (photoConfig.blockGallery || photoConfig.forceLiveCamera) {
      await takePhoto();
      return;
    }

    Alert.alert('Anexar Imagem', isOptionPhoto ? `Origem da foto para: ${optionName}` : 'Escolha a origem', [
      { text: 'Câmera', onPress: takePhoto },
      {
        text: 'Galeria',
        onPress: async () => {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted) {
            Alert.alert('Permissão necessária', 'A galeria precisa estar liberada para anexar a foto.');
            return;
          }

          const locationPromise =
            getFastPhotoLocation();

          const res = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.2,
            base64: true,
            allowsMultipleSelection: isMultiple,
          });

          if (!res.canceled && res.assets) {
            for (const asset of res.assets) {
              await processAsset(
              asset,
              'GALLERY',
              locationPromise
            );
            }
          }
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const removePhoto = (targetKey: string, indexToRemove: number) => {
    if (!photosRef.current[targetKey]) return;

    photosRef.current[targetKey].splice(indexToRemove, 1);

    setRespostas(prev => ({
      ...prev,
      [targetKey]: photosRef.current[targetKey].map(p => p.uri),
    }));
  };

  const handleSave = async () => {

    if (
      isStandaloneRepeatable &&
      repeatableClosed
    ) {
      Alert.alert(
        repeatableMobileText(
          language,
          'Formulário encerrado',
          'Form closed',
          'Formulario cerrado'
        ),
        repeatableMobileText(
          language,
          'Este formulário não aceita mais respostas neste período.',
          'This form no longer accepts responses during this period.',
          'Este formulario ya no acepta respuestas durante este período.'
        )
      );

      return;
    }

    if (
      isStandaloneRepeatable &&
      repeatableAtLimit
    ) {
      Alert.alert(
        repeatableMobileText(
          language,
          'Limite atingido',
          'Limit reached',
          'Límite alcanzado'
        ),
        repeatableMobileText(
          language,
          'O limite máximo de respostas foi atingido.',
          'The maximum number of responses has been reached.',
          'Se alcanzó el número máximo de respuestas.'
        )
      );

      return;
    }

    if (perguntas.length > 0 && Object.keys(respostas).length === 0) {
      Alert.alert('Atenção', 'Responda pelo menos uma pergunta.');
      return;
    }

    for (const pergunta of perguntas) {
      const pId = String(pergunta.id);
      const answer = respostas[pId];
      const answered = answer !== undefined && answer !== null && answer !== '' && (!Array.isArray(answer) || answer.length > 0);

      if (checkQuestionIsMandatory(pergunta) && !answered) {
        Alert.alert('Obrigatório', `Responda a pergunta "${pergunta.texto || pergunta.titulo || pergunta.pergunta}".`);
        return;
      }

      const hasPhotoByOption = pergunta.validacao?.foto_por_opcao === true || pergunta.validacao?.fotoPorOpcao === true;

      if (answered && hasPhotoByOption) {
        const selectedOptions = Array.isArray(answer) ? answer : [answer];

        for (const op of selectedOptions) {
          const fotoKey = `${pId}::foto_${op}`;
          const fotosOp = photosRef.current[fotoKey] || [];

          if (fotosOp.length === 0) {
            Alert.alert('Foto obrigatória', `A foto para a opção "${op}" é obrigatória.`);
            return;
          }
        }
      }
    }

    setSaving(true);
    try {
      const db = await getDBConnection();
      const now = new Date().toISOString();

      const respostasFormatadas: any[] = [];

      for (const pId of Object.keys(respostas).filter(k => !k.includes('::foto_'))) {
        const perguntaConfig = perguntas.find((p) => String(p.id) === String(pId));
        const baseAnswer = respostas[pId];

        if (!perguntaConfig || baseAnswer === undefined || baseAnswer === null || baseAnswer === '') continue;

        if (perguntaConfig.tipo === 'FOTO') {
          const fotos = photosRef.current[pId] || [];
          if (fotos.length > 0) {
            respostasFormatadas.push({
              pergunta_id: pId,
              valor: JSON.stringify(
                fotos.map((f: any) => ({
                  url:
                    f.url ||
                    f.base64,

                  origin:
                    f.origin,

                  capturedAt:
                    f.capturedAt,

                  latitude:
                    f.latitude,

                  longitude:
                    f.longitude,
                }))
              ),
            });
          }
          continue;
        }

        const isMultiple = Array.isArray(baseAnswer);

        respostasFormatadas.push({
          pergunta_id: pId,
          valor: isMultiple ? JSON.stringify(baseAnswer) : String(baseAnswer),
        });

        const hasPhotoByOption = perguntaConfig.validacao?.foto_por_opcao === true || perguntaConfig.validacao?.fotoPorOpcao === true;
        const isOptionQuestion = ['MULTIPLA', 'CHECKBOX', 'MULTIPLE_CHOICE', 'MULTIPLA_ESCOLHA', 'SELECAO', 'DROPDOWN', 'RADIO', 'SINGLE_CHOICE', 'UNICA_ESCOLHA'].includes(String(perguntaConfig.tipo || '').toUpperCase());

        if (hasPhotoByOption && isOptionQuestion) {
          const selectedOptions = Array.isArray(baseAnswer) ? baseAnswer : [baseAnswer];

          for (const op of selectedOptions) {
            const fotoKey = `${pId}::foto_${op}`;
            const fotos = photosRef.current[fotoKey] || [];

            if (fotos.length > 0) {
              const cleanOpt = String(op).replace(/[^a-zA-Z0-9]/g, '');
              respostasFormatadas.push({
                pergunta_id: `${pId}_${cleanOpt}`,
                valor: JSON.stringify(
                fotos.map((f: any) => ({
                  url:
                    f.url ||
                    f.base64,

                  origin:
                    f.origin,

                  capturedAt:
                    f.capturedAt,

                  latitude:
                    f.latitude,

                  longitude:
                    f.longitude,
                }))
              ),
              });
            }
          }
        }
      }

      // STANDALONE_TASK_DURABLE_SAVE_V1
      const taskRaw =
        safeParseObject(
          task?.task_raw_json
        );

      const authUser =
        useAuthStore
          .getState()
          .user;

      const pesquisaId =
        String(
          task?.pesquisa_id ||
          taskRaw?.pesquisa_id ||
          taskRaw?.pesquisaId ||
          taskRaw?.id ||
          id
        ).replace(
          'task-',
          ''
        );

      const projectId =
        task?.projectId ||
        task?.project_id ||
        taskRaw?.projectId ||
        taskRaw?.project_id ||
        authUser
          ?.allowed_project_ids
          ?.[0] ||
        authUser
          ?.allowedProjectIds
          ?.[0] ||
        authUser?.projectId ||
        authUser?.project_id ||
        authUser?.projeto_id;

      const usuarioId =
        task?.usuario_id ||
        task?.usuarioId ||
        taskRaw?.usuario_id ||
        taskRaw?.usuarioId ||
        authUser?.id;

      if (
        !projectId ||
        !usuarioId
      ) {
        throw new Error(
          t(
            'standaloneTaskSaveContextMissing'
          )
        );
      }

      const operationId =
        `coleta_avulsa_${pesquisaId}_${Date.now()}`;

      const payload = {
        projectId:
          String(projectId),
        project_id:
          String(projectId),

        usuario_id:
          String(usuarioId),

        usuario_nome:
          authUser?.nome ||
          authUser?.name ||
          taskRaw?.usuario_nome ||
          '',

        pesquisa_id:
          pesquisaId,

        pesquisa_titulo:
          task?.titulo ||
          taskRaw?.titulo ||
          'Pesquisa Avulsa',

        respostas:
          respostasFormatadas,

        status:
          'COMPLETA',

        data_inicio:
          now,

        data_fim:
          now,

        data_programada:
          now.substring(0, 10),

        loja_id:
          'GERAL',

        loja_nome:
          task?.titulo ||
          taskRaw?.titulo ||
          taskRaw?.nome ||
          'Tarefa Avulsa',

        origem:
          'MOBILE_OFFLINE',

        tipo_registro:
          'COLETA_AVULSA',

        client_operation_id:
          operationId,
      };

      let collectionPersistedLocally =
        false;

      try {
        const tableExists =
          await db.getAllAsync(
            `SELECT name
               FROM sqlite_master
              WHERE type = 'table'
                AND name = 'coletas'`
          ) as any[];

        if (
          Array.isArray(tableExists) &&
          tableExists.length > 0
        ) {
          await db.runAsync(
            `INSERT OR REPLACE INTO coletas (
              id,
              project_id,
              usuario_id,
              loja_id,
              visita_id,
              pesquisa_id,
              status,
              data_inicio,
              data_fim,
              data_programada,
              respostas_json,
              raw_json,
              pending_sync,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              operationId,
              String(projectId),
              String(usuarioId),
              'GERAL',
              null,
              pesquisaId,
              'COMPLETA',
              now,
              now,
              now.substring(0, 10),
              JSON.stringify(
                respostasFormatadas
              ),
              JSON.stringify(
                payload
              ),
              1,
              now,
            ]
          );

          collectionPersistedLocally =
            true;
        }
      } catch (
        localCollectionError: any
      ) {
        await addAppLog({
          level:
            'WARN',
          module:
            'PESQUISA_AVULSA',
          action:
            'LOCAL_COLLECTION_SAVE',
          message:
            'Falha ao persistir espelho local da coleta avulsa.',
          metadata: {
            pesquisaId,
            clientOperationId:
              operationId,
            error:
              localCollectionError
                ?.message ||
              String(
                localCollectionError
              ),
          },
        });
      }

      try {
        await db.runAsync(
          `INSERT INTO sync_queue (
            endpoint,
            payload,
            method,
            created_at
          ) VALUES (?, ?, ?, ?)`,
          [
            '/coletas',
            JSON.stringify(
              payload
            ),
            'POST',
            now
          ]
        );
      } catch (
        queueError: any
      ) {
        if (
          collectionPersistedLocally
        ) {
          await db
            .runAsync(
              `DELETE FROM coletas
                WHERE id = ?`,
              [operationId]
            )
            .catch(
              () => {}
            );
        }

        await addAppLog({
          level:
            'ERROR',
          module:
            'PESQUISA_AVULSA',
          action:
            'SYNC_QUEUE_COLETA',
          message:
            'Falha ao enfileirar coleta avulsa.',
          metadata: {
            endpoint:
              '/coletas',
            pesquisaId,
            clientOperationId:
              operationId,
            error:
              queueError?.message ||
              String(queueError),
          },
        });

        throw new Error(
          t(
            'standaloneTaskQueueError'
          )
        );
      }

      /*
       * Só agora a tarefa pode ser marcada como realizada:
       * - respostas montadas;
       * - coleta local preservada;
       * - fila de sincronização criada.
       */
      const nextTaskStatus =
          isStandaloneRepeatable
            ? 'EM_ANDAMENTO'
            : 'REALIZADA';

        await db.runAsync(
          `UPDATE other_tasks
              SET status = ?,
                  updated_at = ?
            WHERE id = ?`,
          [
            nextTaskStatus,
            now,
            String(id)
          ]
        );

        setTask(
          (prev: any) => ({
            ...prev,
            status:
              nextTaskStatus
          })
        );

      if (
          isStandaloneRepeatable
        ) {
          // OMNI_REPEATABLE_SAVE_TO_TASKS_TAB_FINAL_V1
          const previousRawForRoute =
            repeatableObject(
              task?.task_raw_json
            );

          const nextRepeatableCountForRoute =
            Math.max(
              1,
              Number(
                generalRepeatableStatus
                  ?.currentCount ||
                previousRawForRoute
                  ?.omni_repeatable_current_count ||
                previousRawForRoute
                  ?.general_repeatable_current_count ||
                0
              ) + 1
            );

          const routeRaw = {
            ...previousRawForRoute,

            omni_repeatable_status:
              'ABERTO',

            omni_repeatable_current_count:
              nextRepeatableCountForRoute,

            general_repeatable_current_count:
              nextRepeatableCountForRoute,

            general_repeatable_closed:
              false,

            general_repeatable_blocked:
              false
          };

          await db.runAsync(
            `UPDATE other_tasks
                SET status = 'EM_ANDAMENTO',
                    task_raw_json = ?,
                    updated_at = ?
              WHERE id = ?`,
            [
              JSON.stringify(routeRaw),
              now,
              String(id)
            ]
          );

          setTask(
            (prev: any) => ({
              ...prev,
              status:
                'EM_ANDAMENTO',
              task_raw_json:
                JSON.stringify(routeRaw)
            })
          );

          setGeneralRepeatableStatus(
            (prev: any) => ({
              currentCount:
                nextRepeatableCountForRoute,

              closed:
                false,

              blocked:
                false,

              min:
                prev?.min,

              max:
                prev?.max
            })
          );

          setRespostas({});
          photosRef.current = {};

                  // OMNI_REPEATABLE_SKIP_IMMEDIATE_SYNC_V1
                  // Nao sincronizar imediatamente apos finalizar uma resposta repetivel.
                  // O sync instantaneo sobrescrevia o card com snapshot PENDENTE do backend.

          router.replace({
            pathname:
              '/roteiro',
            params: {
              tab:
                'TAREFAS',
              refresh:
                String(Date.now())
            }
          } as any);
        } else {
          void globalSync()
            .catch(
              () => {}
            );

          Alert.alert(
            'Sucesso',
            'Pesquisa finalizada!',
            [
              {
                text:
                  'OK',
                onPress:
                  () =>
                    router.back()
              }
            ]
          );
        }
    } catch (error: any) {
      Alert.alert('Erro', error?.message || 'Falha ao salvar no banco local.');
    } finally {
      setSaving(false);
    }
  };

    const handleCloseRepeatableForm =
    () => {
      if (
        !isStandaloneRepeatable ||
        repeatableClosed
      ) {
        return;
      }

      Alert.alert(
        repeatableMobileText(
          language,
          'Encerrar formulário?',
          'Close form?',
          '¿Cerrar formulario?'
        ),
        repeatableMobileText(
          language,
          'Após encerrar, novas respostas não poderão ser registradas neste período.',
          'After closing, no new responses can be registered during this period.',
          'Después de cerrar, no se podrán registrar nuevas respuestas durante este período.'
        ),
        [
          {
            text:
              repeatableMobileText(
                language,
                'Cancelar',
                'Cancel',
                'Cancelar'
              ),
            style:
              'cancel'
          },
          {
            text:
              repeatableMobileText(
                language,
                'Encerrar',
                'Close',
                'Cerrar'
              ),
            style:
              'destructive',
            onPress:
              async () => {
                setClosing(true);

                try {
                  await globalSync();

                  const authUser =
                    useAuthStore
                      .getState()
                      .user;

                  const ctx =
                    repeatableContext(
                      task,
                      id,
                      authUser
                    );

                  if (
                    !ctx.projectId ||
                    !ctx.usuarioId ||
                    !ctx.pesquisaId
                  ) {
                    throw new Error(
                      'GENERAL_REPEATABLE_CONTEXT_MISSING'
                    );
                  }

                  const closePayload = {
                    projectId:
                      ctx.projectId,
                    pesquisaId:
                      ctx.pesquisaId,
                    usuarioId:
                      ctx.usuarioId,
                    dataProgramada:
                      ctx.dataProgramada,
                    closed:
                      true,
                    status:
                      'FECHADO',
                    origem:
                      'MOBILE'
                  };

                  // OMNI_REPEATABLE_CLOSE_QUEUE_AFTER_RESPONSES_SINGLE_SOURCE_V1
                  // A fila garante ordem: respostas primeiro, fechamento depois.
                  await addToSyncQueue(
                    '/coletas/general-repeatable-close',
                    closePayload,
                    'POST'
                  );

                  await globalSync();

                  const response =
                    await api(
                      '/coletas/general-repeatable-close',
                      {
                        method:
                          'POST',
                        headers: {
                          'Content-Type':
                            'application/json'
                        },
                        body:
                          JSON.stringify(
                            closePayload
                          )
                      }
                    );

                  if (!response.ok) {
                    throw new Error(
                      'GENERAL_REPEATABLE_CLOSE_FAILED'
                    );
                  }

                  const db =
                    await getDBConnection();

                  // OMNI_REPEATABLE_CLOSE_RAW_LOCAL_SINGLE_SOURCE_V1
                  const previousRawForClose =
                    repeatableObject(
                      task?.task_raw_json
                    );

                  const closedCountForRoute =
                    Math.max(
                      0,
                      Number(
                        generalRepeatableStatus?.currentCount ||
                        previousRawForClose?.omni_repeatable_current_count ||
                        previousRawForClose?.general_repeatable_current_count ||
                        0
                      )
                    );

                  const closedRawForRoute = {
                    ...previousRawForClose,

                    omni_repeatable_status:
                      'FECHADO',

                    general_repeatable_status:
                      'FECHADO',

                    omni_repeatable_current_count:
                      closedCountForRoute,

                    general_repeatable_current_count:
                      closedCountForRoute,

                    omni_repeatable_closed:
                      true,

                    general_repeatable_closed:
                      true,

                    general_repeatable_blocked:
                      true
                  };

                  await db.runAsync(
                    `UPDATE other_tasks
                        SET status = 'REALIZADA',
                            task_raw_json = ?,
                            updated_at = ?
                      WHERE id = ?`,
                    [
                      JSON.stringify(
                        closedRawForRoute
                      ),
                      new Date()
                        .toISOString(),
                      String(id)
                    ]
                  );


                  setGeneralRepeatableStatus(
                    (prev: any) => ({
                      currentCount:
                        Number(
                          prev
                            ?.currentCount || 0
                        ),
                      closed:
                        true,
                      blocked:
                        true,
                      min:
                        prev?.min,
                      max:
                        prev?.max
                    })
                  );

                  setTask(
                    (prev: any) => ({
                      ...prev,
                      status:
                        'REALIZADA'
                    })
                  );

                  Alert.alert(
                    repeatableMobileText(
                      language,
                      'Formulário encerrado',
                      'Form closed',
                      'Formulario cerrado'
                    ),
                    repeatableMobileText(
                      language,
                      'O formulário foi encerrado com sucesso.',
                      'The form was closed successfully.',
                      'El formulario se cerró correctamente.'
                    ),
                    [
                      {
                        text:
                          'OK',
                        onPress:
                          () =>
                            router.replace({
                            pathname:
                              '/roteiro',
                            params: {
                              tab:
                                'TAREFAS',
                              refresh:
                                String(Date.now())
                            }
                          } as any)
                      }
                    ]
                  );
                } catch (error) {
                  console.error(
                    '[GENERAL_REPEATABLE_CLOSE]',
                    error
                  );

                  Alert.alert(
                    repeatableMobileText(
                      language,
                      'Não foi possível encerrar',
                      'Unable to close',
                      'No se pudo cerrar'
                    ),
                    repeatableMobileText(
                      language,
                      'Verifique sua conexão e tente novamente.',
                      'Check your connection and try again.',
                      'Comprueba tu conexión e inténtalo de nuevo.'
                    )
                  );
                } finally {
                  setClosing(false);
                }
              }
          }
        ]
      );
    };

const renderPhotoList = (targetKey: string, mini = false) => {
    const currentPhotos = Array.isArray(respostas[targetKey]) ? respostas[targetKey] : [];

    if (currentPhotos.length === 0) return null;

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosScrollList}>
        {currentPhotos.map((uri: string, idx: number) => (
          <View key={`${targetKey}-${idx}`} style={mini ? styles.photoWrapperMini : styles.photoWrapper}>
            <Image source={{ uri }} style={styles.photoPreview} />
            <TouchableOpacity style={styles.removePhotoBtn} onPress={() => removePhoto(targetKey, idx)}>
              <X size={12} color="#FFF" />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    );
  };

  const renderPergunta = (pergunta: any, index: number) => {
    const pId = String(pergunta.id || index);
    const tipo = String(pergunta.tipo || 'TEXTO').toUpperCase();
    const valorAtual = respostas[pId];

    const productOptions = buildProductOptionsForQuestion(pergunta);
    const rawOptions = parseOptions(pergunta.opcoes);
    const usesDynamicProducts = rawOptions.some(isDynamicProductOption);

    const rawOptionObjects = usesDynamicProducts
      ? productOptions
      : (
          rawOptions.length > 0
            ? rawOptions.map((op: string) => ({ label: String(op), value: String(op) }))
            : productOptions
        );

    const optionObjects = shouldSortChoiceOptions(rawOptions, productOptions, rawOptionObjects, tipo)
      ? sortOptionObjectsAlphabetically(rawOptionObjects)
      : rawOptionObjects;

    const isChoice = ['RADIO', 'SINGLE_CHOICE', 'SELECAO', 'DROPDOWN', 'UNICA_ESCOLHA', 'PRODUTO', 'PRODUCT'].includes(tipo) || (!['TEXTO', 'TEXT', 'NUMERO', 'NUMBER', 'INTEIRO', 'INTEGER', 'DECIMAL', 'MOEDA', 'FOTO'].includes(tipo) && optionObjects.length > 0);
    const isMulti = ['CHECKBOX', 'MULTIPLE_CHOICE', 'MULTIPLA_ESCOLHA', 'MULTIPLA'].includes(tipo);
    const hasPhotoByOption = pergunta.validacao?.foto_por_opcao === true || pergunta.validacao?.fotoPorOpcao === true;

    return (
      <View key={pId} style={[styles.questionCard, { backgroundColor: cardBg, borderColor: border }]}>
        <Text style={[styles.questionText, { color: textPrimary }]}>
          {index + 1}. {pergunta.texto || pergunta.titulo || pergunta.pergunta || 'Pergunta não definida'}
          {checkQuestionIsMandatory(pergunta) ? ' *' : ''}
        </Text>

        {['TEXTO', 'TEXT', 'NUMERO', 'NUMBER', 'INTEIRO', 'INTEGER', 'DECIMAL', 'MOEDA'].includes(tipo) && (
          <TextInput
            style={[styles.input, { backgroundColor: bg, borderColor: border, color: textPrimary }]}
            placeholder={['DECIMAL', 'MOEDA'].includes(tipo) ? '0,00' : 'Digite aqui...'}
            placeholderTextColor={textSecondary}
            keyboardType={tipo.includes('NUM') || tipo === 'NUMBER' || tipo === 'INTEGER' || tipo === 'INTEIRO' || tipo === 'DECIMAL' || tipo === 'MOEDA' ? 'numeric' : 'default'}
            value={valorAtual || ''}
            onChangeText={(text) => handleAnswer(pId, text)}
          />
        )}

        {isChoice && (
          <View style={styles.optionsContainer}>
            {optionObjects.map((opcaoObj: any, i: number) => {
              const opcao = opcaoObj.value;
              const label = opcaoObj.label || opcao;
              const isSelected = valorAtual === opcao;
              const photoKey = `${pId}::foto_${opcao}`;
              return (
                <View key={`${opcao}-${i}`}>
                  <TouchableOpacity
                    style={[styles.optionBtn, { backgroundColor: bg, borderColor: isSelected ? accent : border }]}
                    onPress={() => handleAnswer(pId, opcao)}
                  >
                    {isSelected ? <CheckCircle2 size={20} color={accent} /> : <Circle size={20} color={textSecondary} />}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionText, { color: isSelected ? accent : textPrimary, fontWeight: isSelected ? '700' : '500' }]}>{label}</Text>
                      {opcaoObj.raw?.marca ? <Text style={{ color: textSecondary, fontSize: 11, marginLeft: 12, marginTop: 2 }}>{opcaoObj.raw.marca}</Text> : null}
                    </View>
                  </TouchableOpacity>

                  {isSelected && hasPhotoByOption && (
                    <View style={[styles.optionPhotoArea, { backgroundColor: bg, borderColor: border }]}>
                      <Text style={[styles.optionPhotoLabel, { color: textSecondary }]}>Foto para "{label}"</Text>
                      {renderPhotoList(photoKey, true)}
                      <TouchableOpacity style={[styles.photoBtnMini, { borderColor: accent }]} onPress={() => handlePhotoRequest(pergunta, pId, opcao)}>
                        <Camera size={18} color={accent} />
                        <Text style={[styles.photoBtnTextMini, { color: accent }]}>Anexar foto</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {isMulti && (
          <View style={styles.optionsContainer}>
            {optionObjects.map((opcaoObj: any, i: number) => {
              const opcao = opcaoObj.value;
              const label = opcaoObj.label || opcao;
              const isSelected = (valorAtual || []).includes(opcao);
              const photoKey = `${pId}::foto_${opcao}`;
              return (
                <View key={`${opcao}-${i}`}>
                  <TouchableOpacity
                    style={[styles.optionBtn, { backgroundColor: bg, borderColor: isSelected ? accent : border }]}
                    onPress={() => toggleMultiSelect(pId, opcao)}
                  >
                    {isSelected ? <CheckSquare size={20} color={accent} /> : <Square size={20} color={textSecondary} />}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionText, { color: isSelected ? accent : textPrimary, fontWeight: isSelected ? '700' : '500' }]}>{label}</Text>
                      {opcaoObj.raw?.marca ? <Text style={{ color: textSecondary, fontSize: 11, marginLeft: 12, marginTop: 2 }}>{opcaoObj.raw.marca}</Text> : null}
                    </View>
                  </TouchableOpacity>

                  {isSelected && hasPhotoByOption && (
                    <View style={[styles.optionPhotoArea, { backgroundColor: bg, borderColor: border }]}>
                      <Text style={[styles.optionPhotoLabel, { color: textSecondary }]}>Foto para "{label}"</Text>
                      {renderPhotoList(photoKey, true)}
                      <TouchableOpacity style={[styles.photoBtnMini, { borderColor: accent }]} onPress={() => handlePhotoRequest(pergunta, pId, opcao)}>
                        <Camera size={18} color={accent} />
                        <Text style={[styles.photoBtnTextMini, { color: accent }]}>Foto da opção</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {tipo === 'FOTO' && (
          <View>
            {renderPhotoList(pId)}
            <TouchableOpacity style={[styles.photoBtn, { backgroundColor: bg, borderColor: border, borderStyle: 'dashed' }]} onPress={() => handlePhotoRequest(pergunta, pId)}>
              <Camera size={32} color={accent} />
              <Text style={[styles.photoBtnText, { color: textSecondary }]}>Tirar Foto</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (loading) return <View style={[styles.center, { backgroundColor: bg }]}><ActivityIndicator size="large" color={accent} /></View>;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.container, { backgroundColor: bg }]}>
            <View style={[styles.header, { backgroundColor: cardBg, borderBottomColor: border }]}>
                <View style={styles.headerTop}>
                    <TouchableOpacity onPress={() => router.replace({
                            pathname:
                              '/roteiro',
                            params: {
                              tab:
                                'TAREFAS',
                              refresh:
                                String(Date.now())
                            }
                          } as any)}><ArrowLeft size={24} color={textPrimary} /></TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: textPrimary }]} numberOfLines={1}>{task?.titulo || 'Pesquisa'}</Text>
                    <View style={{ width: 24 }} />
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.taskInfoSection}>
                    <View style={[styles.taskIconBg, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}><ClipboardCheck size={28} color="#3B82F6" /></View>
                    <View style={styles.taskTextWrap}>
                        <Text style={[styles.taskDescTitle, { color: textPrimary }]}>Formulário de Resposta</Text>
                        <Text style={[styles.taskDescSubtitle, { color: textSecondary }]}>Preencha os dados abaixo para finalizar a tarefa.</Text>
                    </View>
                </View>
                {perguntas.length === 0 ? (
                    <View style={styles.emptyContainer}><AlertCircle size={40} color={textSecondary} /><Text style={{ color: textSecondary, marginTop: 10 }}>Nenhuma pergunta encontrada.</Text></View>
                ) : perguntas.map((p, index) => renderPergunta(p, index))}
            </ScrollView>

            {watermarkJob && (
                <View pointerEvents="none" style={styles.watermarkCanvas}>
                    <View
                    ref={watermarkRef}
                    collapsable={false}
                    style={{
                      width: 1080,
                      backgroundColor: '#000000',
                      alignSelf: 'flex-start',
                    }}
                  >
                    <Image
                      source={{
                        uri:
                          watermarkJob.uri
                      }}
                      resizeMode="contain"
                      style={{
                        width: 1080,

                        height:
                          Math.max(
                            1,
                            Math.round(
                              (
                                watermarkJob.height /
                                Math.max(
                                  1,
                                  watermarkJob.width
                                )
                              ) * 1080
                            )
                          ),

                        backgroundColor:
                          '#000000',
                      }}
                      onLoad={
                        handleWatermarkImageLoaded
                      }
                    />

                    {Boolean(
                      watermarkJob.text
                    ) && (
                      <View
                        style={{
                          width: 1080,
                          minHeight: 74,
                          backgroundColor:
                            '#0F172A',
                          paddingHorizontal: 28,
                          paddingVertical: 18,
                          justifyContent:
                            'center',
                        }}
                      >
                        <Text
                          style={{
                            color:
                              '#FFFFFF',
                            fontSize: 22,
                            fontWeight:
                              '700',
                            lineHeight: 30,
                          }}
                        >
                          {
                            watermarkJob.text
                          }
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
            )}

            <View style={[styles.footer, { backgroundColor: cardBg, borderTopColor: border }]}>
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#10B981', opacity: saving || closing || repeatableClosed || repeatableAtLimit ? 0.55 : 1 }]} onPress={handleSave} disabled={saving || closing || repeatableClosed || repeatableAtLimit}>
                    {saving ? <ActivityIndicator color="#FFF" /> : <><Save size={20} color="#FFF" /><Text style={styles.saveBtnText}>
                        {
                          isStandaloneRepeatable
                            ? repeatableMobileText(
                                language,
                                'Finalizar resposta',
                                'Finish response',
                                'Finalizar respuesta'
                              )
                            : 'Finalizar'
                        }
                      </Text></>}
                </TouchableOpacity>

                {isStandaloneRepeatable && !repeatableClosed && (
                  <TouchableOpacity
                    onPress={handleCloseRepeatableForm}
                    disabled={saving || closing}
                    style={{
                      marginTop: 10,
                      minHeight: 50,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#F59E0B',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: saving || closing ? 0.55 : 1
                    }}
                  >
                    {closing
                      ? <ActivityIndicator color="#F59E0B" />
                      : (
                          <Text
                            style={{
                              color: '#F59E0B',
                              fontWeight: '800'
                            }}
                          >
                            {repeatableMobileText(
                              language,
                              'Encerrar formulário',
                              'Close form',
                              'Cerrar formulario'
                            )}
                          </Text>
                        )}
                  </TouchableOpacity>
                )}
            </View>
        </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '900', textAlign: 'center', marginHorizontal: 10 },
  content: { padding: 20, paddingBottom: 40 },
  taskInfoSection: { flexDirection: 'row', alignItems: 'center', marginBottom: 25 },
  taskIconBg: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 15 },
  taskTextWrap: { flex: 1 },
  taskDescTitle: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  taskDescSubtitle: { fontSize: 13, lineHeight: 18 },
  questionCard: { padding: 20, borderRadius: 20, marginBottom: 20, borderWidth: 1, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 },
  questionText: { fontSize: 16, fontWeight: '800', marginBottom: 16, lineHeight: 22 },
  input: { height: 52, borderRadius: 12, paddingHorizontal: 15, fontSize: 15, borderWidth: 1 },
  optionsContainer: { gap: 10 },
  optionBtn: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 12, borderWidth: 1 },
  optionText: { fontSize: 15, marginLeft: 12 },
  photoBtn: { alignItems: 'center', justifyContent: 'center', padding: 30, borderRadius: 12, borderWidth: 2 },
  photoBtnText: { marginTop: 10, fontSize: 14, fontWeight: '600' },
  photosScrollList: { flexDirection: 'row', marginBottom: 10 },
  photoWrapper: { width: 110, height: 140, marginRight: 12, borderRadius: 12, position: 'relative', overflow: 'visible' },
  photoWrapperMini: { width: 72, height: 72, marginRight: 10, borderRadius: 10, position: 'relative', overflow: 'visible' },
  photoPreview: { width: '100%', height: '100%', borderRadius: 10 },
  removePhotoBtn: { position: 'absolute', top: -8, right: -8, backgroundColor: '#EF4444', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF' },
  optionPhotoArea: { marginTop: 8, marginLeft: 34, padding: 10, borderRadius: 12, borderWidth: 1 },
  optionPhotoLabel: { fontSize: 12, fontWeight: '800', marginBottom: 8 },
  photoBtnMini: { width: 96, height: 72, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  photoBtnTextMini: { fontSize: 10, fontWeight: '900', marginTop: 4, textAlign: 'center' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 20 },
  footer: { padding: 20, paddingBottom: 30, borderTopWidth: 1 },
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
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 56, borderRadius: 16, gap: 10 },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800', textTransform: 'uppercase' }
});
