import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle2, Circle, Camera, CheckSquare, Square, Save, AlertCircle, ClipboardCheck, X } from 'lucide-react-native';
import { addAppLog, getDBConnection } from '../../database/db';
import { useSettingsStore } from '../../store/useSettingsStore';
import { globalSync } from '../../services/syncService';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { captureRef } from 'react-native-view-shot';


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

export default function PesquisaAvulsaScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { theme } = useSettingsStore();
  const isDark = theme === 'dark';

  const bg = isDark ? '#0B0F19' : '#F4F7FC';
  const cardBg = isDark ? '#151A27' : '#FFFFFF';
  const textPrimary = isDark ? '#FFFFFF' : '#1E293B';
  const textSecondary = isDark ? '#8F9BB3' : '#64748B';
  const accent = '#FF7A00';
  const border = isDark ? '#1E293B' : '#E2E8F0';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [task, setTask] = useState<any>(null);
  const [perguntas, setPerguntas] = useState<any[]>([]);
  const [respostas, setRespostas] = useState<Record<string, any>>({});
  const [produtosDoMix, setProdutosDoMix] = useState<any[]>([]);
  const photosRef = useRef<Record<string, { uri: string; base64: string }[]>>({});
  const watermarkRef = useRef<View>(null);
  const watermarkResolverRef = useRef<{
    resolve: (value: { uri: string; base64: string }) => void;
    reject: (error: any) => void;
  } | null>(null);
  const [watermarkJob, setWatermarkJob] = useState<{ uri: string; text: string } | null>(null);

  useEffect(() => {
    if (id) loadTask();
  }, [id]);

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

  const buildWatermarkText = () => {
    const now = new Date();
    return `${task?.titulo || 'Pesquisa'} • ${now.toLocaleString('pt-BR')}`;
  };

  const applyWatermarkIfNeeded = async (asset: any) => {
    const photoConfig = getTaskPhotoConfig(task);

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

    const processAsset = async (asset: any) => {
      if (!asset?.uri || !asset?.base64) return;

      if (!assetMatchesOrientation(asset, requiredOrientation)) {
        Alert.alert(
          'Orientação incorreta',
          `Esta foto precisa ser tirada na orientação ${orientationLabel}. Tire uma nova foto para continuar.`
        );
        return;
      }

      const photoPayload = await applyWatermarkIfNeeded(asset);

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

      const res = await ImagePicker.launchCameraAsync({ quality: 0.2, base64: true });
      if (!res.canceled && res.assets?.[0]) await processAsset(res.assets[0]);
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

          const res = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.2,
            base64: true,
            allowsMultipleSelection: isMultiple,
          });

          if (!res.canceled && res.assets) {
            for (const asset of res.assets) {
              await processAsset(asset);
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

      await db.runAsync(`UPDATE other_tasks SET status = 'REALIZADA' WHERE id = ?`, [String(id)]);

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
              valor: JSON.stringify(fotos.map(f => f.base64)),
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
                valor: JSON.stringify(fotos.map(f => f.base64)),
              });
            }
          }
        }
      }

      const pesquisaId = String(task?.pesquisa_id || safeParseObject(task?.task_raw_json)?.pesquisa_id || id).replace('task-', '');

      const payload = {
        projectId: task?.projectId || task?.project_id,
        usuario_id: task?.usuario_id,
        pesquisa_id: pesquisaId,
        pesquisa_titulo: task?.titulo || 'Pesquisa Avulsa',
        respostas: respostasFormatadas,
        data_inicio: now,
        data_fim: now,
        loja_id: 'GERAL',
        loja_nome: 'Tarefa Extra / Gestão',
        origem: 'MOBILE_OFFLINE',
        client_operation_id: `coleta_avulsa_${pesquisaId}_${Date.now()}`,
      };

      try {
        await db.runAsync(
          `INSERT INTO sync_queue (endpoint, payload, method, created_at) VALUES (?, ?, ?, ?)`,
          ['/coletas', JSON.stringify(payload), 'POST', now]
        );
      } catch (queueError: any) {
        await addAppLog({
          level: 'ERROR',
          module: 'PESQUISA_AVULSA',
          action: 'SYNC_QUEUE_COLETA',
          message: 'Falha ao enfileirar coleta avulsa.',
          metadata: {
            endpoint: '/coletas',
            pesquisaId,
            clientOperationId: payload.client_operation_id,
            error: queueError?.message || String(queueError),
          },
        });

        throw new Error('Não foi possível colocar a pesquisa na fila de sincronização. Não saia da tela; tente salvar novamente em instantes.');
      }

      globalSync();
      Alert.alert('Sucesso', 'Pesquisa finalizada!', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (error: any) {
      Alert.alert('Erro', error?.message || 'Falha ao salvar no banco local.');
    } finally {
      setSaving(false);
    }
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
                    <TouchableOpacity onPress={() => router.back()}><ArrowLeft size={24} color={textPrimary} /></TouchableOpacity>
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
                    <View ref={watermarkRef} collapsable={false} style={styles.watermarkFrame}>
                        <Image source={{ uri: watermarkJob.uri }} style={styles.watermarkImage} onLoad={handleWatermarkImageLoaded} />
                        <View style={styles.watermarkOverlay}>
                            <Text style={styles.watermarkText}>{watermarkJob.text}</Text>
                        </View>
                    </View>
                </View>
            )}

            <View style={[styles.footer, { backgroundColor: cardBg, borderTopColor: border }]}>
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#10B981', opacity: saving ? 0.7 : 1 }]} onPress={handleSave} disabled={saving}>
                    {saving ? <ActivityIndicator color="#FFF" /> : <><Save size={20} color="#FFF" /><Text style={styles.saveBtnText}>Finalizar</Text></>}
                </TouchableOpacity>
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