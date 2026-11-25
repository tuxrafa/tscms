import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, PointerSensor, useDraggable, useSensor, useSensors } from '@dnd-kit/core';
import { componentCatalog, type ComponentDefinition } from '@tscms/block-registry';
import {
  createHistory,
  emptyDocument,
  historyCommit,
  historyRedo,
  historyUndo,
  type CanonicalDocument,
  type ContentNode,
  type DefaultContentNode,
  type HistoryState,
} from '@tscms/content-schema';
import { Button, Field, Panel, TextInput } from '@tscms/ui';
import type { FieldDefinition } from '@tscms/content-schema';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import LinkExtension from '@tiptap/extension-link';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { t } from './i18n';
import { canonicalToEditor, editorToCanonical, plainRichText } from './rich-text';
import { api, useSession } from './session';

const defaultElements: Record<string, DefaultContentNode['element']> = {
  heading: 'heading',
  text: 'text',
  image: 'image',
  button: 'button',
  'button-group': 'buttonGroup',
  divider: 'divider',
  spacer: 'spacer',
  list: 'list',
  quote: 'quote',
  code: 'code',
};

function nodeFromCatalog(definition: ComponentDefinition): ContentNode {
  const element = defaultElements[definition.name];
  if (definition.kind === 'default-content' && element) {
    return { id: crypto.randomUUID(), type: 'defaultContent', element, data: definition.example };
  }
  return { id: crypto.randomUUID(), type: 'block', name: definition.name, data: definition.example };
}

export function App() {
  const token = useSession((state) => state.token);
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={token ? <Shell /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const setToken = useSession((state) => state.setToken);
  const locale = useSession((state) => state.locale);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', organizationName: '' });
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const path = mode === 'login' ? '/v1/management/auth/login' : '/v1/management/auth/register';
      const body = mode === 'login' ? { email: form.email, password: form.password } : form;
      const result = await api(path, { method: 'POST', body });
      setToken(result.token);
      navigate('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha');
    }
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p className="text-sm uppercase tracking-[0.2em] text-pine">TSCMS</p>
      <h1 className="mb-6 text-5xl">{mode === 'login' ? t('login', locale) : t('register', locale)}</h1>
      <form className="flex flex-col gap-3" onSubmit={submit}>
        {mode === 'register' ? (
          <>
            <Field label={t('name', locale)}>
              <TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </Field>
            <Field label={t('organization', locale)}>
              <TextInput value={form.organizationName} onChange={(event) => setForm({ ...form, organizationName: event.target.value })} required />
            </Field>
          </>
        ) : null}
        <Field label={t('email', locale)}>
          <TextInput type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
        </Field>
        <Field label={t('password', locale)}>
          <TextInput type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
        </Field>
        {error ? <p className="text-sm text-clay">{error}</p> : null}
        <Button type="submit">{mode === 'login' ? t('login', locale) : t('register', locale)}</Button>
      </form>
      <button className="mt-4 text-left text-sm underline" type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? t('register', locale) : t('login', locale)}
      </button>
    </main>
  );
}

function Shell() {
  const locale = useSession((state) => state.locale);
  const clear = useSession((state) => state.clear);
  const links = [
    ['/', t('studio', locale)],
    ['/sites', t('sites', locale)],
  ];
  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b border-line bg-[#ebe4d6] p-4 md:border-b-0 md:border-r">
        <p className="font-serif text-2xl">TSCMS</p>
        <nav className="mt-6 flex flex-col gap-2">
          {links.map(([href, label]) => (
            <Link key={href} className="rounded-full px-3 py-2 hover:bg-white" to={href}>
              {label}
            </Link>
          ))}
        </nav>
        <Button className="mt-8" variant="ghost" onClick={clear}>
          {t('logout', locale)}
        </Button>
      </aside>
      <div className="p-4 md:p-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sites" element={<SitesPage />} />
          <Route path="/sites/:siteId/*" element={<SiteArea />} />
        </Routes>
      </div>
    </div>
  );
}

function Dashboard() {
  const token = useSession((state) => state.token);
  const me = useQuery({ queryKey: ['me'], queryFn: () => api('/v1/management/auth/me', { token }) });
  return (
    <div>
      <h1 className="text-4xl">Estúdio</h1>
      <p className="mt-2 max-w-xl text-ink/70">O conteúdo fica no CMS. A apresentação fica com quem consome. O design fica no repositório do site.</p>
      <Panel title="Conta">
        <p>{me.data?.user?.name}</p>
        <p className="text-sm text-ink/60">{me.data?.user?.email}</p>
      </Panel>
    </div>
  );
}

function SitesPage() {
  const token = useSession((state) => state.token);
  const queryClient = useQueryClient();
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api('/v1/management/sites', { token }) });
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: () => api('/v1/management/organizations', { token }) });
  const [name, setName] = useState('Novo site');
  const create = useMutation({
    mutationFn: async () => {
      const organizationId = orgs.data.data[0].id;
      const workspaces = await api(`/v1/management/organizations/${organizationId}/workspaces`, { token });
      return api(`/v1/management/organizations/${organizationId}/workspaces/${workspaces.data[0].id}/sites`, {
        method: 'POST',
        token,
        body: { name, locales: ['pt-BR'] },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sites'] }),
  });
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-4xl">Sites</h1>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <TextInput value={name} onChange={(event) => setName(event.target.value)} />
        <Button type="submit">Criar site</Button>
      </form>
      <div className="grid gap-3 md:grid-cols-2">
        {(sites.data?.data ?? []).map((site: { id: string; name: string; key: string }) => (
          <Link key={site.id} to={`/sites/${site.id}`} className="rounded-3xl border border-line bg-white p-4">
            <h2>{site.name}</h2>
            <p className="text-sm text-ink/60">{site.key}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function SiteArea() {
  const { siteId } = useParams();
  const locale = useSession((state) => state.locale);
  const links = [
    ['', 'Visão'],
    ['pages', t('pages', locale)],
    ['content', t('content', locale)],
    ['models', t('models', locale)],
    ['templates', t('templates', locale)],
    ['fragments', t('fragments', locale)],
    ['polls', t('polls', locale)],
    ['media', t('media', locale)],
  ];
  return (
    <div>
      <nav className="mb-6 flex flex-wrap gap-2">
        {links.map(([path, label]) => (
          <Link key={path} className="rounded-full bg-white px-3 py-1 text-sm" to={path}>
            {label}
          </Link>
        ))}
      </nav>
      <Routes>
        <Route path="/" element={<SiteHome siteId={siteId!} />} />
        <Route path="/pages" element={<PagesConsole siteId={siteId!} />} />
        <Route path="/pages/:pageId" element={<PageEditor siteId={siteId!} />} />
        <Route path="/content" element={<ContentDesk siteId={siteId!} />} />
        <Route path="/models" element={<ModelsPage siteId={siteId!} />} />
        <Route path="/templates" element={<TemplatesPage siteId={siteId!} />} />
        <Route path="/fragments" element={<FragmentsPage siteId={siteId!} />} />
        <Route path="/polls" element={<PollsPage siteId={siteId!} />} />
        <Route path="/media" element={<MediaPage siteId={siteId!} />} />
      </Routes>
    </div>
  );
}

function SiteHome({ siteId }: { siteId: string }) {
  const token = useSession((state) => state.token);
  const site = useQuery({ queryKey: ['site', siteId], queryFn: () => api(`/v1/management/sites/${siteId}`, { token }) });
  return (
    <div>
      <h1 className="text-4xl">{site.data?.name ?? 'Site'}</h1>
      <p className="text-ink/60">{site.data?.key}</p>
    </div>
  );
}

function PagesConsole({ siteId }: { siteId: string }) {
  const token = useSession((state) => state.token);
  const locale = useSession((state) => state.locale);
  const queryClient = useQueryClient();
  const [view, setView] = useState<'columns' | 'list' | 'cards'>('columns');
  const [stack, setStack] = useState<Array<string | undefined>>([undefined]);
  const [title, setTitle] = useState('Nova página');
  const columns = useQuery({
    queryKey: ['tree', siteId, stack.join('|')],
    queryFn: async () =>
      Promise.all(
        stack.map((parent) =>
          api(`/v1/management/sites/${siteId}/tree${parent ? `?parentFolderId=${parent}` : ''}`, { token }),
        ),
      ),
  });
  const create = useMutation({
    mutationFn: () =>
      api(`/v1/management/sites/${siteId}/pages`, {
        method: 'POST',
        token,
        body: { title, document: emptyDocument({ id: 'nova', type: 'page', title }) },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tree', siteId] }),
  });
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl">Páginas</h1>
        <div className="flex gap-2">
          <Button variant={view === 'columns' ? 'primary' : 'ghost'} onClick={() => setView('columns')}>{t('columnView', locale)}</Button>
          <Button variant={view === 'list' ? 'primary' : 'ghost'} onClick={() => setView('list')}>{t('listView', locale)}</Button>
          <Button variant={view === 'cards' ? 'primary' : 'ghost'} onClick={() => setView('cards')}>{t('cardView', locale)}</Button>
        </div>
      </div>
      <form
        className="mb-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <TextInput value={title} onChange={(event) => setTitle(event.target.value)} />
        <Button type="submit">Criar</Button>
      </form>
      {view === 'columns' ? (
        <div className="flex gap-3 overflow-x-auto">
          {(columns.data ?? []).map((column, index) => (
            <div key={stack[index] ?? 'root'} className="min-w-64 rounded-3xl border border-line bg-white p-3">
              {(column.folders ?? []).map((folder: { id: string; name: string }) => (
                <button key={folder.id} className="block w-full rounded-xl px-2 py-2 text-left hover:bg-paper" type="button" onClick={() => setStack([...stack.slice(0, index + 1), folder.id])}>
                  {folder.name} ›
                </button>
              ))}
              {(column.pages ?? []).map((page: { id: string; title: string; status: string }) => (
                <Link key={page.id} className="block rounded-xl px-2 py-2 hover:bg-paper" to={`/sites/${siteId}/pages/${page.id}`}>
                  <span>{page.title}</span>
                  <span className="ml-2 text-xs uppercase text-ink/50">{page.status}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      ) : view === 'cards' ? (
        <div className="grid gap-3 md:grid-cols-3">
          {(columns.data?.[0]?.pages ?? []).map((page: { id: string; title: string; path: string; status: string }) => (
            <Link key={page.id} to={`/sites/${siteId}/pages/${page.id}`} className="rounded-2xl border border-line bg-white p-3">
              <strong>{page.title}</strong>
              <p className="text-sm text-ink/60">{page.path}</p>
            </Link>
          ))}
        </div>
      ) : (
        <PageList siteId={siteId} />
      )}
    </div>
  );
}

function PageList({ siteId }: { siteId: string }) {
  const token = useSession((state) => state.token);
  const locale = useSession((state) => state.locale);
  const queryClient = useQueryClient();
  const pages = useQuery({ queryKey: ['pages', siteId], queryFn: () => api(`/v1/management/sites/${siteId}/pages`, { token }) });
  const rows = (pages.data?.data ?? []) as Array<{ id: string; title: string; path: string; status: string }>;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const visibleIds = rows.map((page) => page.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const action = useMutation({
    mutationFn: async (kind: 'publish' | 'unpublish') => {
      const results = await Promise.allSettled(
        selectedIds.map((id) => api(`/v1/management/sites/${siteId}/pages/${id}/${kind}`, { method: 'POST', token })),
      );
      const failed = results.filter((result) => result.status === 'rejected').length;
      return { failed, total: results.length };
    },
    onSuccess: ({ failed, total }) => {
      setNotice(failed === 0 ? `${total} página(s) atualizada(s).` : `${failed} de ${total} não puderam ser atualizadas.`);
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['pages', siteId] });
      queryClient.invalidateQueries({ queryKey: ['tree', siteId] });
    },
  });
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button disabled={selectedIds.length === 0 || action.isPending} onClick={() => action.mutate('publish')}>{t('publish', locale)}</Button>
        <Button variant="ghost" disabled={selectedIds.length === 0 || action.isPending} onClick={() => action.mutate('unpublish')}>{t('unpublish', locale)}</Button>
        <span className="text-sm text-ink/60">{selectedIds.length} selecionadas</span>
        {notice ? <span className="text-sm">{notice}</span> : null}
      </div>
      <div className="overflow-hidden rounded-3xl border border-line bg-white">
        <label className="flex items-center gap-3 border-b border-line px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelectedIds(allSelected ? [] : visibleIds)}
          />
          <span>{t('selectAll', locale)}</span>
        </label>
        {rows.map((page) => (
          <div key={page.id} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0">
            <input
              type="checkbox"
              checked={selectedIds.includes(page.id)}
              onChange={() => setSelectedIds((current) => (current.includes(page.id) ? current.filter((id) => id !== page.id) : [...current, page.id]))}
              aria-label={page.title}
            />
            <Link className="min-w-0 flex-1" to={`/sites/${siteId}/pages/${page.id}`}>
              <strong>{page.title}</strong>
              <span className="ml-2 text-sm text-ink/60">{page.path}</span>
            </Link>
            <span className="text-xs uppercase text-ink/50">{page.status}</span>
          </div>
        ))}
        {rows.length === 0 ? <p className="px-3 py-4 text-sm text-ink/60">Nenhuma página.</p> : null}
      </div>
    </div>
  );
}

function PageEditor({ siteId }: { siteId: string }) {
  const { pageId } = useParams();
  const token = useSession((state) => state.token);
  const locale = useSession((state) => state.locale);
  const queryClient = useQueryClient();
  const page = useQuery({
    queryKey: ['page', siteId, pageId],
    queryFn: () => api(`/v1/management/sites/${siteId}/pages/${pageId}`, { token }),
    enabled: Boolean(pageId),
  });
  const site = useQuery({ queryKey: ['site', siteId], queryFn: () => api(`/v1/management/sites/${siteId}`, { token }) });
  const current = page.data as { id: string; path: string; version: number; document: CanonicalDocument } | undefined;
  const [history, setHistory] = useState<HistoryState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const document = history?.present;
  useEffect(() => {
    setHistory(null);
    setSelected(null);
  }, [pageId]);
  useEffect(() => {
    if (current?.document && !history) setHistory(createHistory(current.document));
  }, [current, history]);
  const sensors = useSensors(useSensor(PointerSensor));
  const save = useMutation({
    mutationFn: () =>
      api(`/v1/management/sites/${siteId}/pages/${pageId}`, {
        method: 'PATCH',
        token,
        body: { title: document?.metadata.title, document, expectedVersion: current?.version },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['page-tree', siteId] }),
  });
  const publish = useMutation({
    mutationFn: () => api(`/v1/management/sites/${siteId}/pages/${pageId}/publish`, { method: 'POST', token }),
  });
  if (page.isError) return <p>Não foi possível abrir esta página.</p>;
  if (!document) return <p>Carregando a página…</p>;
  const section = document.slots.main?.sections[0];
  const selectedNode = section?.children.find((node) => node.id === selected);
  return (
    <DndContext
      sensors={sensors}
      onDragEnd={(event) => {
        const blockName = String(event.active.id).replace(/^library:/, '');
        const definition = componentCatalog.find((item) => item.name === blockName);
        if (!definition || !section || !history) return;
        setHistory(historyCommit(history, { type: 'insert', sectionId: section.id, node: nodeFromCatalog(definition) }));
      }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl">{document.metadata.title}</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setHistory(historyUndo(history!))}>Desfazer</Button>
          <Button variant="ghost" onClick={() => setHistory(historyRedo(history!))}>Refazer</Button>
          <Button onClick={() => save.mutate()}>{t('save', locale)}</Button>
          <Button onClick={() => publish.mutate()}>{t('publish', locale)}</Button>
          <a
            className="rounded-full bg-white px-4 py-2 text-sm"
            href={`/v1/delivery/sites/${site.data?.key}/pages/by-path?path=${encodeURIComponent(current?.path ?? '/')}&format=html`}
            target="_blank"
            rel="noreferrer"
          >
            {t('preview', locale)}
          </a>
        </div>
      </div>
      <p className="mb-3 text-sm text-ink/60">{t('canvasNote', locale)}</p>
      <div className="grid gap-3 lg:grid-cols-[220px_1fr_260px]">
        <aside className="rounded-3xl border border-line bg-white p-3">
          <h2 className="mb-2 font-serif text-xl">{t('library', locale)}</h2>
          <div className="flex max-h-[32rem] flex-col gap-1 overflow-auto">
            {componentCatalog.map((item) => (
              <LibraryButton
                key={item.name}
                item={item}
                onInsert={() => {
                  if (!section || !history) return;
                  setHistory(historyCommit(history, { type: 'insert', sectionId: section.id, node: nodeFromCatalog(item) }));
                }}
              />
            ))}
          </div>
        </aside>
        <div
          className="min-h-96 rounded-3xl border border-dashed border-line bg-white p-4"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            const definition = componentCatalog.find((item) => item.name === event.dataTransfer.getData('text/plain'));
            if (!definition || !section || !history) return;
            setHistory(historyCommit(history, { type: 'insert', sectionId: section.id, node: nodeFromCatalog(definition) }));
          }}
        >
          {section?.children.map((node) => (
            <button
              key={node.id}
              type="button"
              className={`mb-2 block w-full rounded-2xl border p-3 text-left ${selected === node.id ? 'border-pine' : 'border-line'}`}
              onClick={() => setSelected(node.id)}
            >
              <span className="text-xs uppercase text-ink/50">{node.type === 'block' ? node.name : node.type === 'defaultContent' ? node.element : 'fragmento'}</span>
              <p>{nodeSummary(node)}</p>
            </button>
          ))}
        </div>
        <aside className="rounded-3xl border border-line bg-white p-3">
          <h2 className="mb-2 font-serif text-xl">{t('inspector', locale)}</h2>
          {selectedNode && selectedNode.type !== 'fragmentReference' ? (
            <Inspector
              definition={definitionFor(selectedNode)}
              nodeId={selectedNode.id}
              value={selectedNode.data}
              onChange={(data) =>
                setHistory(
                  historyCommit(history!, {
                    type: 'update',
                    sectionId: section?.id,
                    nodeId: selectedNode.id,
                    patch: { data },
                  }),
                )
              }
            />
          ) : (
            <p className="text-sm text-ink/60">Selecione um bloco.</p>
          )}
        </aside>
      </div>
    </DndContext>
  );
}

function LibraryButton({ item, onInsert }: { item: ComponentDefinition; onInsert: () => void }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `library:${item.name}` });
  return (
    <button
      ref={setNodeRef}
      className="rounded-xl px-2 py-1 text-left text-sm hover:bg-paper"
      type="button"
      onClick={onInsert}
      {...listeners}
      {...attributes}
    >
      {item.label}
    </button>
  );
}

function definitionFor(node: ContentNode): ComponentDefinition | undefined {
  if (node.type === 'block') return componentCatalog.find((item) => item.name === node.name);
  if (node.type !== 'defaultContent') return undefined;
  const name = Object.entries(defaultElements).find(([, element]) => element === node.element)?.[0];
  return name ? componentCatalog.find((item) => item.name === name) : undefined;
}

function nodeSummary(node: ContentNode): string {
  if (node.type === 'fragmentReference') return node.fragmentId;
  if (node.type === 'defaultContent' && node.element === 'text') return plainRichText(node.data.body) || 'Texto';
  if (node.type === 'defaultContent') return String(node.data.text ?? node.data.alt ?? node.data.label ?? node.element);
  return String(node.data.title ?? node.name);
}

function Inspector({
  definition,
  nodeId,
  value,
  onChange,
}: {
  definition?: ComponentDefinition;
  nodeId: string;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const richFields = definition?.fields.filter((field) => field.type === 'richtext') ?? [];
  const booleanFields = definition?.fields.filter((field) => field.type === 'boolean') ?? [];
  return (
    <div className="flex flex-col gap-2">
      {richFields.map((field) => (
        <RichTextField
          key={`${nodeId}:${field.name}`}
          label={field.label ?? field.name}
          value={value[field.name]}
          onChange={(body) => onChange({ ...value, [field.name]: body })}
        />
      ))}
      {Object.entries(value)
        .filter(([, entry]) => ['string', 'number'].includes(typeof entry))
        .map(([key, entry]) => (
          <Field key={key} label={key}>
            <TextInput value={String(entry)} onChange={(event) => onChange({ ...value, [key]: event.target.value })} />
          </Field>
        ))}
      {booleanFields.map((field) => (
        <BooleanOption key={field.name} field={field} checked={value[field.name] === true} onChange={(checked) => onChange({ ...value, [field.name]: checked })} />
      ))}
    </div>
  );
}

function BooleanOption({ field, checked, onChange }: { field: FieldDefinition; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{field.label ?? field.name}</span>
    </label>
  );
}

function RichTextField({ label, value, onChange }: { label: string; value: unknown; onChange: (value: ReturnType<typeof editorToCanonical>) => void }) {
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;
  const editor = useEditor({
    extensions: [StarterKit, LinkExtension.configure({ openOnClick: false, autolink: false })],
    content: canonicalToEditor(value),
    onUpdate: ({ editor: current }) => {
      const next = editorToCanonical(current.getJSON());
      if (JSON.stringify(next) === JSON.stringify(editorToCanonical(canonicalToEditor(valueRef.current)))) return;
      onChangeRef.current(next);
    },
  });
  useEffect(() => {
    if (!editor) return;
    const next = canonicalToEditor(value);
    if (JSON.stringify(editorToCanonical(editor.getJSON())) === JSON.stringify(editorToCanonical(next))) return;
    editor.commands.setContent(next, false);
  }, [editor, value]);
  return (
    <Field label={label}>
      <div className="rounded-2xl border border-line">
        <div className="flex gap-1 border-b border-line p-1">
          <Button type="button" variant="ghost" onClick={() => editor?.chain().focus().toggleBold().run()}>Negrito</Button>
          <Button type="button" variant="ghost" onClick={() => editor?.chain().focus().toggleItalic().run()}>Itálico</Button>
          <Button type="button" variant="ghost" onClick={() => editor?.chain().focus().toggleBulletList().run()}>Lista</Button>
        </div>
        <EditorContent editor={editor} className="prose max-w-none px-2 py-1 text-sm" />
      </div>
    </Field>
  );
}

function ModelsPage({ siteId }: { siteId: string }) {
  const token = useSession((state) => state.token);
  const queryClient = useQueryClient();
  const types = useQuery({ queryKey: ['types', siteId], queryFn: () => api(`/v1/management/sites/${siteId}/content-types`, { token }) });
  const [name, setName] = useState('article');
  const create = useMutation({
    mutationFn: () =>
      api(`/v1/management/sites/${siteId}/content-types`, {
        method: 'POST',
        token,
        body: {
          name,
          label: name,
          fields: [
            { name: 'title', type: 'text', required: true },
            { name: 'body', type: 'richtext', required: true },
          ],
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['types', siteId] }),
  });
  return (
    <div>
      <h1 className="mb-4 text-4xl">Modelos</h1>
      <form
        className="mb-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <TextInput value={name} onChange={(event) => setName(event.target.value)} />
        <Button type="submit">Criar modelo</Button>
      </form>
      <ul>
        {(types.data?.data ?? []).map((type: { id: string; label: string; name: string }) => (
          <li key={type.id}>{type.label} · {type.name}</li>
        ))}
      </ul>
    </div>
  );
}

function ContentDesk({ siteId }: { siteId: string }) {
  const token = useSession((state) => state.token);
  const entries = useQuery({ queryKey: ['entries', siteId], queryFn: () => api(`/v1/management/sites/${siteId}/content`, { token }) });
  return (
    <div>
      <h1 className="mb-4 text-4xl">Conteúdo</h1>
      <ul className="flex flex-col gap-2">
        {(entries.data?.data ?? []).map((entry: { id: string; slug: string; status: string }) => (
          <li key={entry.id} className="rounded-2xl bg-white px-3 py-2">
            {entry.slug} · {entry.status}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TemplatesPage({ siteId }: { siteId: string }) {
  const token = useSession((state) => state.token);
  const queryClient = useQueryClient();
  const templates = useQuery({ queryKey: ['templates', siteId], queryFn: () => api(`/v1/management/sites/${siteId}/templates`, { token }) });
  const ensure = useMutation({
    mutationFn: () => api(`/v1/management/sites/${siteId}/templates/blueprints`, { method: 'POST', token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates', siteId] }),
  });
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-4xl">Templates</h1>
        <Button onClick={() => ensure.mutate()}>Instalar modelos iniciais</Button>
      </div>
      <ul>
        {(templates.data?.data ?? []).map((template: { id: string; name: string; status: string }) => (
          <li key={template.id}>{template.name} · {template.status}</li>
        ))}
      </ul>
    </div>
  );
}

function FragmentsPage({ siteId }: { siteId: string }) {
  const token = useSession((state) => state.token);
  const fragments = useQuery({
    queryKey: ['fragments', siteId],
    queryFn: () => api(`/v1/management/sites/${siteId}/experience-fragments`, { token }),
  });
  return (
    <div>
      <h1 className="mb-4 text-4xl">Fragmentos de experiência</h1>
      <ul>
        {(fragments.data?.data ?? []).map((fragment: { id: string; title: string; path: string }) => (
          <li key={fragment.id}>{fragment.title} · {fragment.path}</li>
        ))}
      </ul>
    </div>
  );
}

function PollsPage({ siteId }: { siteId: string }) {
  const token = useSession((state) => state.token);
  const polls = useQuery({ queryKey: ['polls', siteId], queryFn: () => api(`/v1/management/sites/${siteId}/polls`, { token }) });
  return (
    <div>
      <h1 className="mb-4 text-4xl">Enquetes</h1>
      <p className="mb-3 text-sm text-ink/70">A votação pública inicial não exige login e não garante um voto por pessoa.</p>
      <ul>
        {(polls.data?.data ?? []).map((poll: { id: string; question: string; status: string }) => (
          <li key={poll.id}>{poll.question} · {poll.status}</li>
        ))}
      </ul>
    </div>
  );
}

function MediaPage({ siteId }: { siteId: string }) {
  const token = useSession((state) => state.token);
  const media = useQuery({ queryKey: ['media', siteId], queryFn: () => api(`/v1/management/sites/${siteId}/media`, { token }) });
  return (
    <div>
      <h1 className="mb-4 text-4xl">Mídia</h1>
      <ul>
        {(media.data?.data ?? []).map((asset: { id: string; filename: string }) => (
          <li key={asset.id}>{asset.filename}</li>
        ))}
      </ul>
    </div>
  );
}
