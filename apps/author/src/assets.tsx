import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Field, TextInput } from '@tscms/ui';
import { useState } from 'react';
import { api, useSession } from './session';

export interface DamAsset {
  id: string;
  filename: string;
  title: string;
  description: string;
  alt: string | null;
  folderId: string | null;
  folder: string;
  mediaType: string;
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  status: string;
  version: number;
  focalPoint: { x: number; y: number } | null;
  createdAt: string;
  updatedAt: string;
}

interface DamFolder {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
}

export function MediaPage({ siteId }: { siteId: string }) {
  const token = useSession((state) => state.token);
  const queryClient = useQueryClient();
  const site = useQuery({ queryKey: ['site', siteId], queryFn: () => api(`/v1/management/sites/${siteId}`, { token }) as Promise<{ key: string }> });
  const folders = useQuery({ queryKey: ['asset-folders', siteId], queryFn: () => api(`/v1/management/sites/${siteId}/asset-folders`, { token }) as Promise<{ data: DamFolder[] }> });
  const [folderId, setFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'columns' | 'grid' | 'list'>('grid');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [notice, setNotice] = useState('');
  const assets = useQuery({
    queryKey: ['media', siteId, folderId, query],
    queryFn: () => api(`/v1/management/sites/${siteId}/media${folderId ? `?folderId=${folderId}` : ''}${query ? `${folderId ? '&' : '?'}q=${encodeURIComponent(query)}` : ''}`, { token }) as Promise<{ data: DamAsset[] }>,
  });
  const selected = (assets.data?.data ?? []).find((asset) => asset.id === selectedId) ?? null;
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['media', siteId] });
    queryClient.invalidateQueries({ queryKey: ['asset-folders', siteId] });
  };
  const createFolder = useMutation({
    mutationFn: () => api(`/v1/management/sites/${siteId}/asset-folders`, { method: 'POST', token, body: { name: folderName, parentId: folderId } }),
    onSuccess: () => {
      setFolderName('');
      setNotice('Pasta criada.');
      refresh();
    },
    onError: (error: Error) => setNotice(error.message),
  });
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/v1/management/sites/${siteId}/assets/${selectedId}`, { method: 'PATCH', token, body }),
    onSuccess: () => {
      setNotice('Metadados salvos.');
      refresh();
    },
    onError: (error: Error) => setNotice(error.message),
  });
  const publish = useMutation({
    mutationFn: (status: 'publish' | 'unpublish') => api(`/v1/management/sites/${siteId}/assets/${selectedId}/${status}`, { method: 'POST', token }),
    onSuccess: () => {
      setNotice('Status atualizado.');
      refresh();
    },
    onError: (error: Error) => setNotice(error.message),
  });

  async function uploadFiles(files: FileList | null) {
    if (!files?.length || !token) return;
    for (const file of files) {
      setNotice(`Enviando ${file.name}…`);
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`/v1/management/sites/${siteId}/media${folderId ? `?folderId=${folderId}` : ''}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body,
      });
      const payload = await response.json();
      if (!response.ok) {
        setNotice(payload?.error?.message ?? `Falha em ${file.name}.`);
        return;
      }
      if (payload.duplicate) {
        setNotice(`${file.name} já existe neste site. O asset existente foi mantido.`);
        setSelectedId(payload.asset.id);
        continue;
      }
      setSelectedId(payload.asset.id);
      setNotice(`${file.name} processado.`);
    }
    refresh();
  }

  const items = assets.data?.data ?? [];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-4xl">Assets</h1>
        <div className="flex flex-wrap gap-2">
          {(['columns', 'grid', 'list'] as const).map((mode) => (
            <Button key={mode} type="button" variant={view === mode ? 'primary' : 'ghost'} onClick={() => setView(mode)}>
              {mode === 'columns' ? 'Colunas' : mode === 'grid' ? 'Grade' : 'Lista'}
            </Button>
          ))}
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="rounded-full bg-pine px-3 py-2 text-sm text-white">
          Enviar
          <input className="hidden" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" onChange={(event) => void uploadFiles(event.target.files)} />
        </label>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (folderName.trim()) createFolder.mutate();
          }}
        >
          <TextInput value={folderName} placeholder="Nova pasta" onChange={(event) => setFolderName(event.target.value)} />
          <Button type="submit">Criar pasta</Button>
        </form>
        <TextInput value={query} placeholder="Buscar" onChange={(event) => setQuery(event.target.value)} />
      </div>
      {notice ? <p className="mb-3 text-sm">{notice}</p> : null}
      <div className={view === 'columns' ? 'grid gap-3 md:grid-cols-[16rem_1fr_20rem]' : 'grid gap-3 lg:grid-cols-[1fr_20rem]'}>
        {view === 'columns' ? (
          <ul className="rounded-3xl border border-line bg-white p-2">
            <li>
              <button type="button" className="w-full rounded-2xl px-3 py-2 text-left" onClick={() => setFolderId(null)}>Todas</button>
            </li>
            {(folders.data?.data ?? []).map((folder) => (
              <li key={folder.id}>
                <button type="button" className={`w-full rounded-2xl px-3 py-2 text-left ${folderId === folder.id ? 'bg-mist' : ''}`} onClick={() => setFolderId(folder.id)}>
                  {folder.path}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {view === 'list' ? (
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Nome</th><th>Tipo</th><th>Tamanho</th><th>Pasta</th><th>Status</th><th>Modificado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((asset) => (
                <tr key={asset.id} className="cursor-pointer border-t border-line" onClick={() => setSelectedId(asset.id)}>
                  <td>{asset.title}</td>
                  <td>{asset.mediaType}</td>
                  <td>{asset.byteSize}</td>
                  <td>{asset.folder}</td>
                  <td>{asset.status}</td>
                  <td>{new Date(asset.updatedAt).toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
            {items.map((asset) => (
              <li key={asset.id}>
                <button type="button" className={`w-full rounded-3xl border bg-white p-2 text-left ${selectedId === asset.id ? 'border-pine' : 'border-line'}`} onClick={() => setSelectedId(asset.id)}>
                  {asset.status === 'published' && site.data?.key ? (
                    <img className="mb-2 aspect-square w-full rounded-2xl object-cover" alt="" src={`/v1/delivery/sites/${site.data.key}/assets/${asset.id}/renditions/thumbnail`} />
                  ) : (
                    <div className="mb-2 grid aspect-square place-items-center rounded-2xl bg-mist text-xs uppercase">{asset.mediaType}</div>
                  )}
                  <strong className="block truncate text-sm">{asset.title}</strong>
                  <span className="text-xs text-ink/60">{asset.status}{asset.width ? ` · ${asset.width}×${asset.height}` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <AssetDetails asset={selected} onSave={(body) => save.mutate(body)} onPublish={() => publish.mutate('publish')} onUnpublish={() => publish.mutate('unpublish')} />
      </div>
    </div>
  );
}

function AssetDetails({
  asset,
  onSave,
  onPublish,
  onUnpublish,
}: {
  asset: DamAsset | null;
  onSave: (body: Record<string, unknown>) => void;
  onPublish: () => void;
  onUnpublish: () => void;
}) {
  if (!asset) return <aside className="rounded-3xl border border-line bg-white p-3 text-sm text-ink/60">Selecione um asset.</aside>;
  return (
    <aside className="rounded-3xl border border-line bg-white p-3">
      <h2 className="mb-2 font-serif text-xl">{asset.title}</h2>
      <p className="mb-2 text-xs text-ink/60">{asset.contentType} · v{asset.version} · {asset.status}</p>
      <form
        key={asset.id}
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const x = form.get('x');
          const y = form.get('y');
          onSave({
            title: String(form.get('title') ?? ''),
            description: String(form.get('description') ?? ''),
            alt: String(form.get('alt') ?? ''),
            focalPoint: x !== '' && y !== '' ? { x: Number(x), y: Number(y) } : null,
          });
        }}
      >
        <Field label="Título"><TextInput name="title" defaultValue={asset.title} /></Field>
        <Field label="Descrição"><TextInput name="description" defaultValue={asset.description} /></Field>
        <Field label="Texto alternativo"><TextInput name="alt" defaultValue={asset.alt ?? ''} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Foco X"><TextInput name="x" defaultValue={asset.focalPoint?.x ?? ''} /></Field>
          <Field label="Foco Y"><TextInput name="y" defaultValue={asset.focalPoint?.y ?? ''} /></Field>
        </div>
        <Button type="submit">Salvar</Button>
      </form>
      <div className="mt-2 flex gap-2">
        <Button type="button" onClick={onPublish}>Publicar</Button>
        <Button type="button" variant="ghost" onClick={onUnpublish}>Despublicar</Button>
      </div>
    </aside>
  );
}

export function AssetPicker({
  siteId,
  onSelect,
}: {
  siteId: string;
  onSelect: (asset: DamAsset, siteKey: string) => void;
}) {
  const token = useSession((state) => state.token);
  const site = useQuery({ queryKey: ['site', siteId], queryFn: () => api(`/v1/management/sites/${siteId}`, { token }) as Promise<{ key: string }> });
  const assets = useQuery({ queryKey: ['media', siteId, null, ''], queryFn: () => api(`/v1/management/sites/${siteId}/media`, { token }) as Promise<{ data: DamAsset[] }> });
  const published = (assets.data?.data ?? []).filter((asset) => asset.status === 'published' && asset.mediaType === 'image');
  return (
    <div className="rounded-2xl border border-line p-2">
      <p className="mb-1 text-xs text-ink/60">Assets publicados</p>
      <ul className="flex max-h-40 flex-col gap-1 overflow-auto">
        {published.map((asset) => (
          <li key={asset.id}>
            <button type="button" className="w-full rounded-xl px-2 py-1 text-left text-sm hover:bg-mist" onClick={() => site.data?.key && onSelect(asset, site.data.key)}>
              {asset.title}
            </button>
          </li>
        ))}
        {published.length === 0 ? <li className="text-xs text-ink/50">Nenhuma imagem publicada.</li> : null}
      </ul>
    </div>
  );
}
