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
  type PageMetadata,
} from '@tscms/content-schema';
import { Button, Field, Panel, TextInput } from '@tscms/ui';
import type { FieldDefinition } from '@tscms/content-schema';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AdminAudit, AdminGroups, AdminUsers, PageHistory } from './admin';
import LinkExtension from '@tiptap/extension-link';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { t } from './i18n';
import { canonicalToEditor, editorToCanonical, plainRichText } from './rich-text';
import { AssetPicker, MediaPage } from './assets';
import { SiteCard, type SiteSummary } from './site-card';
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

function experienceReference(fragment: { id: string; path: string }): ContentNode {
  return { id: crypto.randomUUID(), type: 'fragmentReference', fragmentId: fragment.id, mode: 'linked', path: fragment.path };
}

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
  const [params] = useSearchParams();
  const setToken = useSession((state) => state.setToken);
  const locale = useSession((state) => state.locale);
  const invite = params.get('invite');
  const reset = params.get('reset');
  const [mode, setMode] = useState<'login' | 'register'>(invite || reset ? 'login' : 'login');
  const [form, setForm] = useState({ name: '', email: '', password: '', organizationName: '' });
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const path = invite
        ? '/v1/management/auth/invitations/accept'
        : reset
          ? '/v1/management/auth/password/reset'
          : mode === 'login'
            ? '/v1/management/auth/login'
            : '/v1/management/auth/register';
      const body = invite || reset
        ? { token: invite ?? reset, password: form.password }
        : mode === 'login'
          ? { email: form.email, password: form.password }
          : form;
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
      <h1 className="mb-6 text-5xl">{invite ? 'Definir senha' : reset ? 'Nova senha' : mode === 'login' ? t('login', locale) : t('register', locale)}</h1>
      <form className="flex flex-col gap-3" onSubmit={submit}>
        {mode === 'register' && !invite && !reset ? (
          <>
            <Field label={t('name', locale)}>
              <TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </Field>
            <Field label={t('organization', locale)}>
              <TextInput value={form.organizationName} onChange={(event) => setForm({ ...form, organizationName: event.target.value })} required />
            </Field>
          </>
        ) : null}
        {invite || reset ? null : (
          <Field label={t('email', locale)}>
            <TextInput type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          </Field>
        )}
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
  const token = useSession((state) => state.token);
  const clear = useSession((state) => state.clear);
  const links = [
    ['/', t('studio', locale)],
    ['/sites', t('sites', locale)],
    ['/admin/users', 'Usuários'],
    ['/admin/groups', 'Grupos'],
    ['/admin/audit', 'Auditoria'],
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
        <Button
          className="mt-8"
          variant="ghost"
          onClick={() => {
            void api('/v1/management/auth/logout', { method: 'POST', token }).finally(clear);
          }}
        >
          {t('logout', locale)}
        </Button>
      </aside>
      <div className="p-4 md:p-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sites" element={<SitesPage />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/groups" element={<AdminGroups />} />
          <Route path="/admin/audit" element={<AdminAudit />} />
          <Route path="/sites/:siteId/*" element={<SiteArea />} />
        </Routes>
      </div>
    </div>
  );
}

function PasswordForm() {
  const token = useSession((state) => state.token);
  const [currentPassword, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  return (
    <form
      className="mt-4 flex max-w-sm flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void api('/v1/management/auth/password', { method: 'POST', token, body: { currentPassword, password } })
          .then(() => setMessage('Senha alterada. As outras sessões foram encerradas.'))
          .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Falha'));
      }}
    >
      <Field label="Senha atual">
        <TextInput type="password" value={currentPassword} onChange={(event) => setCurrent(event.target.value)} required />
      </Field>
      <Field label="Nova senha">
        <TextInput type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </Field>
      <Button type="submit">Alterar senha</Button>
      {message ? <p className="text-sm">{message}</p> : null}
    </form>
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
        <PasswordForm />
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
        {(sites.data?.data ?? []).map((site: SiteSummary) => (
          <SiteCard key={site.id} site={site} />
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
        <Route path="/pages/:pageId/history" element={<PageHistory siteId={siteId!} />} />
        <Route path="/pages/:pageId" element={<PageEditor siteId={siteId!} />} />
        <Route path="/content" element={<ContentDesk siteId={siteId!} />} />
        <Route path="/models" element={<ModelsPage siteId={siteId!} />} />
        <Route path="/templates" element={<TemplatesPage siteId={siteId!} />} />
        <Route path="/fragments" element={<FragmentsPage siteId={siteId!} />} />
        <Route path="/fragments/content/new" element={<ContentFragmentEditor siteId={siteId!} />} />
        <Route path="/fragments/content/:fragmentId" element={<ContentFragmentEditor siteId={siteId!} />} />
        <Route path="/fragments/experience/new" element={<ExperienceFragmentEditor siteId={siteId!} />} />
        <Route path="/fragments/experience/:fragmentId" element={<ExperienceFragmentEditor siteId={siteId!} />} />
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

type PageRecord = {
  id: string;
  title: string;
  slug: string;
  path: string;
  locale: string;
  folderId: string | null;
  status: string;
  version: number;
  document: CanonicalDocument;
};

type PageProperties = { slug: string; path: string; folderId: string | null };

type FolderOption = { id: string; name: string; path: string };

function commitDocument(state: HistoryState, present: CanonicalDocument): HistoryState {
  return { past: [...state.past, state.present], present, future: [] };
}

function composePath(folderPath: string | null, slug: string): string {
  if (!folderPath) return slug === 'home' ? '/' : `/${slug}`;
  return `${folderPath.replace(/\/$/, '')}/${slug}`;
}

function parseTags(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))].slice(0, 20);
}

function metadataForSave(metadata: PageMetadata): PageMetadata {
  const next: PageMetadata = { ...metadata, title: metadata.title.trim() };
  const tags = parseTags((next.tags ?? []).join(','));
  if (tags.length > 0) next.tags = tags;
  else delete next.tags;
  for (const key of ['description', 'canonical', 'robots', 'language', 'nav', 'footer', 'template', 'theme'] as const) {
    const value = next[key]?.trim();
    if (!value) delete next[key];
    else next[key] = value;
  }
  if (next.openGraph) {
    const openGraph = { ...next.openGraph };
    for (const key of ['title', 'description', 'image'] as const) {
      const value = openGraph[key]?.trim();
      if (!value) delete openGraph[key];
      else openGraph[key] = value;
    }
    if (!openGraph.title && !openGraph.description && !openGraph.image) delete next.openGraph;
    else next.openGraph = openGraph;
  }
  return next;
}

function PageSettings({
  locale,
  document,
  properties,
  folders,
  onDocument,
  onProperties,
}: {
  locale: 'pt-BR' | 'en';
  document: CanonicalDocument;
  properties: PageProperties;
  folders: FolderOption[];
  onDocument: (document: CanonicalDocument) => void;
  onProperties: (properties: PageProperties) => void;
}) {
  const metadata = document.metadata;
  const folderPath = folders.find((folder) => folder.id === properties.folderId)?.path ?? null;
  const setMetadata = (patch: Partial<PageMetadata>, language?: string) => {
    onDocument({
      ...document,
      locale: language ?? document.locale,
      metadata: { ...metadata, ...patch },
    });
  };
  const setOpenGraph = (key: 'title' | 'description' | 'image', value: string) => {
    setMetadata({ openGraph: { ...metadata.openGraph, [key]: value } });
  };
  return (
    <div className="flex flex-col gap-3">
      <Field label={t('pageTitle', locale)}>
        <TextInput className="w-full" value={metadata.title} onChange={(event) => setMetadata({ title: event.target.value })} />
      </Field>
      <Field label={t('slug', locale)}>
        <TextInput
          className="w-full"
          value={properties.slug}
          onChange={(event) => onProperties({ ...properties, slug: event.target.value, path: composePath(folderPath, event.target.value.trim() || properties.slug) })}
        />
      </Field>
      <Field label={t('path', locale)}>
        <TextInput className="w-full" value={properties.path} onChange={(event) => onProperties({ ...properties, path: event.target.value })} />
      </Field>
      <Field label={t('language', locale)}>
        <TextInput
          className="w-full"
          value={metadata.language ?? document.locale}
          onChange={(event) => setMetadata({ language: event.target.value }, event.target.value.trim().length >= 2 ? event.target.value.trim() : document.locale)}
        />
      </Field>
      <Field label={t('folder', locale)}>
        <select
          className="w-full rounded-xl border border-line bg-white px-3 py-2 outline-none focus:border-pine"
          value={properties.folderId ?? ''}
          onChange={(event) => {
            const folderId = event.target.value || null;
            const nextFolder = folders.find((folder) => folder.id === folderId)?.path ?? null;
            onProperties({ ...properties, folderId, path: composePath(nextFolder, properties.slug) });
          }}
        >
          <option value="">{t('folderRoot', locale)}</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name} ({folder.path})
            </option>
          ))}
        </select>
      </Field>
      <TagsField tags={metadata.tags} onChange={(tags) => setMetadata({ tags })} label={t('tags', locale)} hint={t('tagsHint', locale)} />
      <h3 className="mt-2 font-serif text-lg">{t('metadata', locale)}</h3>
      <Field label={t('description', locale)}>
        <TextInput className="w-full" value={metadata.description ?? ''} onChange={(event) => setMetadata({ description: event.target.value })} />
      </Field>
      <Field label={t('canonical', locale)}>
        <TextInput className="w-full" value={metadata.canonical ?? ''} onChange={(event) => setMetadata({ canonical: event.target.value })} />
      </Field>
      <Field label={t('robots', locale)}>
        <TextInput className="w-full" value={metadata.robots ?? ''} onChange={(event) => setMetadata({ robots: event.target.value })} />
      </Field>
      <Field label={t('template', locale)}>
        <TextInput className="w-full" value={metadata.template ?? ''} onChange={(event) => setMetadata({ template: event.target.value })} />
      </Field>
      <Field label={t('theme', locale)}>
        <TextInput className="w-full" value={metadata.theme ?? ''} onChange={(event) => setMetadata({ theme: event.target.value })} />
      </Field>
      <Field label={t('navigation', locale)}>
        <TextInput className="w-full" value={metadata.nav ?? ''} onChange={(event) => setMetadata({ nav: event.target.value })} />
      </Field>
      <Field label={t('footer', locale)}>
        <TextInput className="w-full" value={metadata.footer ?? ''} onChange={(event) => setMetadata({ footer: event.target.value })} />
      </Field>
      <Field label={t('socialTitle', locale)}>
        <TextInput className="w-full" value={metadata.openGraph?.title ?? ''} onChange={(event) => setOpenGraph('title', event.target.value)} />
      </Field>
      <Field label={t('socialDescription', locale)}>
        <TextInput className="w-full" value={metadata.openGraph?.description ?? ''} onChange={(event) => setOpenGraph('description', event.target.value)} />
      </Field>
      <Field label={t('socialImage', locale)}>
        <TextInput className="w-full" value={metadata.openGraph?.image ?? ''} onChange={(event) => setOpenGraph('image', event.target.value)} />
      </Field>
    </div>
  );
}

function TagsField({ tags, onChange, label, hint }: { tags: string[] | undefined; onChange: (tags: string[]) => void; label: string; hint: string }) {
  const [raw, setRaw] = useState((tags ?? []).join(', '));
  return (
    <Field label={label}>
      <TextInput
        className="w-full"
        value={raw}
        onChange={(event) => {
          setRaw(event.target.value);
          onChange(parseTags(event.target.value));
        }}
      />
      <span className="text-xs text-ink/60">{hint}</span>
    </Field>
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
  const folders = useQuery({
    queryKey: ['folders', siteId],
    queryFn: () => api(`/v1/management/sites/${siteId}/folders`, { token }),
  });
  const experienceLibrary = useQuery({
    queryKey: ['experience-fragments', siteId],
    queryFn: () => api(`/v1/management/sites/${siteId}/experience-fragments`, { token }) as Promise<{ data: Array<{ id: string; title: string; path: string; status: string }> }>,
  });
  const experienceFragments = experienceLibrary.data?.data ?? [];
  const current = page.data as PageRecord | undefined;
  const [history, setHistory] = useState<HistoryState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<'page' | 'block'>('page');
  const [properties, setProperties] = useState<PageProperties | null>(null);
  const document = history?.present;
  useEffect(() => {
    setHistory(null);
    setSelected(null);
    setPanel('page');
    setProperties(null);
  }, [pageId]);
  useEffect(() => {
    if (current?.document && !history) setHistory(createHistory(current.document));
  }, [current, history]);
  useEffect(() => {
    if (current && !properties) setProperties({ slug: current.slug, path: current.path, folderId: current.folderId });
  }, [current, properties]);
  const sensors = useSensors(useSensor(PointerSensor));
  const save = useMutation({
    mutationFn: () => {
      const nextDocument = document ? { ...document, metadata: metadataForSave(document.metadata), locale: document.locale } : document;
      return api(`/v1/management/sites/${siteId}/pages/${pageId}`, {
        method: 'PATCH',
        token,
        body: {
          title: nextDocument?.metadata.title,
          slug: properties?.slug.trim(),
          path: properties?.path.trim(),
          locale: nextDocument?.locale,
          folderId: properties?.folderId,
          document: nextDocument,
          expectedVersion: current?.version,
        },
      });
    },
    onSuccess: (saved: PageRecord) => {
      queryClient.setQueryData(['page', siteId, pageId], saved);
      setProperties({ slug: saved.slug, path: saved.path, folderId: saved.folderId });
      if (saved.document) setHistory(createHistory(saved.document));
      queryClient.invalidateQueries({ queryKey: ['page-tree', siteId] });
      queryClient.invalidateQueries({ queryKey: ['pages', siteId] });
    },
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
        const activeId = String(event.active.id);
        if (!section || !history) return;
        if (activeId.startsWith('fragment:')) {
          const fragment = experienceFragments.find((item) => item.id === activeId.slice('fragment:'.length));
          if (!fragment) return;
          setHistory(historyCommit(history, { type: 'insert', sectionId: section.id, node: experienceReference(fragment) }));
          return;
        }
        const definition = componentCatalog.find((item) => item.name === activeId.replace(/^library:/, ''));
        if (!definition) return;
        setHistory(historyCommit(history, { type: 'insert', sectionId: section.id, node: nodeFromCatalog(definition) }));
      }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl">{document.metadata.title}</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setHistory(historyUndo(history!))}>Desfazer</Button>
          <Button variant="ghost" onClick={() => setHistory(historyRedo(history!))}>Refazer</Button>
          <Button
            variant={panel === 'page' ? 'primary' : 'ghost'}
            onClick={() => {
              setPanel('page');
              setSelected(null);
            }}
          >
            {t('properties', locale)}
          </Button>
          <Link className="rounded-full bg-white px-4 py-2 text-sm" to={`/sites/${siteId}/pages/${pageId}/history`}>Histórico</Link>
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
      <p className="mb-3 text-sm text-ink/60">{current?.path} · {current?.status}</p>
      <p className="mb-3 text-sm text-ink/60">{t('canvasNote', locale)} Em qualquer texto, {'${fragmento.nome}'} coloca o fragmento de texto publicado com esse nome.</p>
      {save.isError ? <p className="mb-3 text-sm text-clay">{save.error instanceof Error ? save.error.message : 'Não foi possível salvar.'}</p> : null}
      <div className="grid gap-3 lg:grid-cols-[220px_1fr_320px]">
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
          <h2 className="mb-2 mt-4 font-serif text-xl">Fragmentos</h2>
          <p className="mb-2 text-xs text-ink/60">Arraste um banner, ou outro fragmento de experiência, para reutilizar nesta página.</p>
          <div className="flex max-h-48 flex-col gap-1 overflow-auto">
            {experienceFragments.length === 0 ? <p className="text-xs text-ink/50">Nenhum fragmento ainda.</p> : experienceFragments.map((fragment) => (
              <FragmentLibraryButton
                key={fragment.id}
                fragment={fragment}
                onInsert={() => {
                  if (!section || !history) return;
                  setHistory(historyCommit(history, { type: 'insert', sectionId: section.id, node: experienceReference(fragment) }));
                }}
              />
            ))}
          </div>
        </aside>
        <div
          className="min-h-96 rounded-3xl border border-dashed border-line bg-white p-4"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            if (!section || !history) return;
            const fragmentId = event.dataTransfer.getData('application/x-tscms-fragment');
            const fragment = experienceFragments.find((item) => item.id === fragmentId);
            if (fragment) {
              setHistory(historyCommit(history, { type: 'insert', sectionId: section.id, node: experienceReference(fragment) }));
              return;
            }
            const definition = componentCatalog.find((item) => item.name === event.dataTransfer.getData('text/plain'));
            if (!definition) return;
            setHistory(historyCommit(history, { type: 'insert', sectionId: section.id, node: nodeFromCatalog(definition) }));
          }}
        >
          {section?.children.map((node) => (
            <button
              key={node.id}
              type="button"
              className={`mb-2 block w-full rounded-2xl border p-3 text-left ${selected === node.id ? 'border-pine' : 'border-line'}`}
              onClick={() => {
                setSelected(node.id);
                setPanel('block');
              }}
            >
              <span className="text-xs uppercase text-ink/50">{node.type === 'block' ? node.name : node.type === 'defaultContent' ? node.element : 'fragmento'}</span>
              <p>{node.type === 'fragmentReference' ? (experienceFragments.find((item) => item.id === node.fragmentId)?.title ?? node.path ?? 'Fragmento ligado') : nodeSummary(node)}</p>
            </button>
          ))}
        </div>
        <aside className="max-h-[40rem] overflow-auto rounded-3xl border border-line bg-white p-3">
          <h2 className="mb-2 font-serif text-xl">{panel === 'page' ? t('properties', locale) : t('inspector', locale)}</h2>
          {panel === 'page' && properties && document ? (
            <PageSettings
              locale={locale}
              document={document}
              properties={properties}
              folders={(folders.data?.data ?? []) as FolderOption[]}
              onDocument={(next) => setHistory(commitDocument(history!, next))}
              onProperties={setProperties}
            />
          ) : selectedNode?.type === 'fragmentReference' ? (
            <div className="flex flex-col gap-2 text-sm">
              <p>{experienceFragments.find((item) => item.id === selectedNode.fragmentId)?.title ?? 'Fragmento de experiência'}</p>
              <p className="text-ink/60">{selectedNode.path}</p>
              <p className="text-ink/60">Este banner fica ligado à versão publicada. Publicar o fragmento atualiza as páginas que o usam.</p>
              <Link className="underline" to={`/sites/${siteId}/fragments/experience/${selectedNode.fragmentId}`}>Editar fragmento</Link>
            </div>
          ) : selectedNode ? (
            <Inspector
              siteId={siteId}
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

function FragmentLibraryButton({ fragment, onInsert }: { fragment: { id: string; title: string; status: string }; onInsert: () => void }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `fragment:${fragment.id}` });
  return (
    <button
      ref={setNodeRef}
      className="rounded-xl px-2 py-1 text-left text-sm hover:bg-paper"
      type="button"
      draggable
      onDragStart={(event) => event.dataTransfer.setData('application/x-tscms-fragment', fragment.id)}
      onClick={onInsert}
      {...listeners}
      {...attributes}
    >
      {fragment.title}
      <span className="ml-2 text-xs uppercase text-ink/40">{fragment.status === 'published' ? 'publicado' : 'rascunho'}</span>
    </button>
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
  siteId,
  definition,
  nodeId,
  value,
  onChange,
}: {
  siteId: string;
  definition?: ComponentDefinition;
  nodeId: string;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const richFields = definition?.fields.filter((field) => field.type === 'richtext') ?? [];
  const booleanFields = definition?.fields.filter((field) => field.type === 'boolean') ?? [];
  const mediaFields = definition?.fields.filter((field) => field.type === 'media') ?? [];
  return (
    <div className="flex flex-col gap-2">
      {mediaFields.map((field) => (
        <Field key={field.name} label={field.label ?? field.name}>
          <AssetPicker
            siteId={siteId}
            onSelect={(asset, siteKey) => {
              const preset = asset.width && asset.width >= 1200 ? 'large' : 'thumbnail';
              const src = `/v1/delivery/sites/${siteKey}/assets/${asset.id}/renditions/${preset}`;
              const reference = { assetId: asset.id, src, alt: asset.alt || asset.title, versionPolicy: 'latestPublished' };
              onChange({ ...value, assetId: asset.id, src, alt: reference.alt, [field.name]: reference });
            }}
          />
        </Field>
      ))}
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

function publishNotice(paths: string[] | undefined) {
  const count = paths?.length ?? 0;
  if (count === 0) return 'Fragmento publicado. Nenhuma página publicada usa este fragmento ainda.';
  if (count === 1) return 'Fragmento publicado. 1 página atualizada.';
  return `Fragmento publicado. ${count} páginas atualizadas.`;
}

function statusLabel(status: string) {
  if (status === 'draft') return 'rascunho';
  if (status === 'published') return 'publicado';
  if (status === 'in_review') return 'em revisão';
  if (status === 'archived') return 'arquivado';
  return status;
}

function FragmentsPage({ siteId }: { siteId: string }) {
  const token = useSession((state) => state.token);
  const content = useQuery({
    queryKey: ['content-fragments', siteId],
    queryFn: () => api(`/v1/management/sites/${siteId}/fragments`, { token }),
  });
  const experience = useQuery({
    queryKey: ['experience-fragments', siteId],
    queryFn: () => api(`/v1/management/sites/${siteId}/experience-fragments`, { token }),
  });
  const contentRows = (content.data?.data ?? []) as Array<{ id: string; title: string; slug: string; status: string }>;
  const experienceRows = (experience.data?.data ?? []) as Array<{ id: string; title: string; path: string; status: string }>;
  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-4xl">Fragmentos de conteúdo</h1>
          <Link className="rounded-full bg-white px-4 py-2 text-sm" to={`/sites/${siteId}/fragments/content/new`}>Novo</Link>
        </div>
        <p className="mb-3 max-w-2xl text-sm text-ink/70">Dados estruturados, no formato de um modelo. O mesmo fragmento pode ser reutilizado em várias páginas.</p>
        {contentRows.length === 0 ? <p className="text-sm text-ink/60">Nenhum fragmento de conteúdo.</p> : (
          <ul className="flex flex-col gap-2">
            {contentRows.map((fragment) => (
              <li key={fragment.id}>
                <Link className="rounded-2xl bg-white px-3 py-2" to={`/sites/${siteId}/fragments/content/${fragment.id}`}>
                  {fragment.title} · {fragment.slug} · {statusLabel(fragment.status)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-4xl">Fragmentos de experiência</h1>
          <Link className="rounded-full bg-white px-4 py-2 text-sm" to={`/sites/${siteId}/fragments/experience/new`}>Novo</Link>
        </div>
        <p className="mb-3 max-w-2xl text-sm text-ink/70">Blocos visuais reutilizáveis. A apresentação final continua no site que consome o fragmento.</p>
        {experienceRows.length === 0 ? <p className="text-sm text-ink/60">Nenhum fragmento de experiência.</p> : (
          <ul className="flex flex-col gap-2">
            {experienceRows.map((fragment) => (
              <li key={fragment.id}>
                <Link className="rounded-2xl bg-white px-3 py-2" to={`/sites/${siteId}/fragments/experience/${fragment.id}`}>
                  {fragment.title} · {fragment.path} · {statusLabel(fragment.status)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type ContentModel = { id: string; label: string; name: string; definition: { fields: FieldDefinition[] } };

function ContentFragmentEditor({ siteId }: { siteId: string }) {
  const { fragmentId } = useParams();
  const navigate = useNavigate();
  const token = useSession((state) => state.token);
  const queryClient = useQueryClient();
  const fragment = useQuery({
    queryKey: ['content-fragment', siteId, fragmentId],
    enabled: Boolean(fragmentId),
    queryFn: () => api(`/v1/management/sites/${siteId}/fragments/${fragmentId}`, { token }),
  });
  const types = useQuery({
    queryKey: ['types', siteId],
    queryFn: () => api(`/v1/management/sites/${siteId}/content-types`, { token }),
  });
  const loaded = useRef<string | null>(null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [contentTypeId, setContentTypeId] = useState('');
  const [data, setData] = useState<Record<string, unknown>>({});
  const [rawData, setRawData] = useState('{}');
  const [version, setVersion] = useState<number | null>(null);
  const [status, setStatus] = useState('draft');
  const [notice, setNotice] = useState('');
  const models = (types.data?.data ?? []) as ContentModel[];
  const fields = models.find((model) => model.id === contentTypeId)?.definition.fields ?? [];

  useEffect(() => {
    const key = fragmentId ?? 'new';
    if (loaded.current === key) return;
    if (!fragmentId) {
      setTitle('');
      setSlug('');
      setContentTypeId('');
      setData({});
      setRawData('{}');
      setVersion(null);
      setStatus('draft');
      setNotice('');
      loaded.current = key;
      return;
    }
    if (!fragment.data) return;
    const row = fragment.data as { title: string; slug: string; contentTypeId: string | null; data: Record<string, unknown>; version: number; status: string };
    setTitle(row.title);
    setSlug(row.slug);
    setContentTypeId(row.contentTypeId ?? '');
    setData(row.data ?? {});
    setRawData(JSON.stringify(row.data ?? {}, null, 2));
    setVersion(row.version);
    setStatus(row.status);
    setNotice('');
    loaded.current = key;
  }, [fragment.data, fragmentId]);

  function payloadData() {
    if (!contentTypeId) {
      const parsed = JSON.parse(rawData) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Os dados precisam ser um objeto JSON.');
      return parsed as Record<string, unknown>;
    }
    const next: Record<string, unknown> = {};
    for (const field of fields) {
      if (data[field.name] !== undefined) next[field.name] = data[field.name];
      if (field.name === 'title' && field.type === 'text' && (next.title === undefined || next.title === '') && title) next.title = title;
      if (field.type === 'richtext' && (next[field.name] === undefined || next[field.name] === '')) {
        next[field.name] = { type: 'doc', content: [{ type: 'paragraph', children: [] }] };
      }
      if (field.type === 'boolean' && next[field.name] === undefined) next[field.name] = false;
    }
    return next;
  }

  const save = useMutation({
    mutationFn: () => {
      let data: Record<string, unknown>;
      try {
        data = payloadData();
      } catch (error) {
        throw new Error(error instanceof SyntaxError ? 'Os dados precisam ser um objeto JSON.' : error instanceof Error ? error.message : 'Dados inválidos.');
      }
      const body = {
        title,
        contentTypeId: contentTypeId || null,
        data,
        expectedVersion: version ?? undefined,
      };
      if (!fragmentId) {
        return api(`/v1/management/sites/${siteId}/fragments`, {
          method: 'POST',
          token,
          body: { title, contentTypeId: contentTypeId || undefined, data: body.data },
        });
      }
      return api(`/v1/management/sites/${siteId}/fragments/${fragmentId}`, { method: 'PATCH', token, body });
    },
    onSuccess: (saved: { id: string; version: number; status: string; slug: string }) => {
      setVersion(saved.version);
      setStatus(saved.status);
      setSlug(saved.slug);
      setNotice('Fragmento salvo.');
      queryClient.invalidateQueries({ queryKey: ['content-fragments', siteId] });
      if (!fragmentId) {
        loaded.current = saved.id;
        navigate(`/sites/${siteId}/fragments/content/${saved.id}`, { replace: true });
      }
    },
    onError: (error: Error) => setNotice(error.message),
  });
  const publish = useMutation({
    mutationFn: () => api(`/v1/management/sites/${siteId}/fragments/${fragmentId}/publish`, { method: 'POST', token }),
    onSuccess: (saved: { status: string; updatedPages?: string[] }) => {
      setStatus(saved.status);
      setNotice(publishNotice(saved.updatedPages));
      queryClient.invalidateQueries({ queryKey: ['content-fragments', siteId] });
    },
    onError: (error: Error) => setNotice(error.message),
  });

  if (fragmentId && fragment.isError) return <p>Não foi possível abrir este fragmento.</p>;
  if (fragmentId && loaded.current !== fragmentId) return <p>Carregando o fragmento…</p>;
  return (
    <form
      className="flex max-w-3xl flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setNotice('');
        save.mutate();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-4xl">{fragmentId ? title || 'Fragmento de conteúdo' : 'Novo fragmento de conteúdo'}</h1>
        <div className="flex gap-2">
          <Link className="rounded-full bg-white px-4 py-2 text-sm" to={`/sites/${siteId}/fragments`}>Voltar</Link>
          <Button type="submit" disabled={save.isPending}>{t('save', 'pt-BR')}</Button>
          <Button type="button" disabled={!fragmentId || publish.isPending} onClick={() => publish.mutate()}>{t('publish', 'pt-BR')}</Button>
        </div>
      </div>
      <p className="text-sm text-ink/60">{statusLabel(status)}</p>
      <p className="text-sm text-ink/70">
        {slug
          ? <>Em qualquer texto, escreva <code>{'${fragmento.'}{slug}{'}'}</code>. A página publicada troca a tag pelo texto deste fragmento.</>
          : 'Ao salvar, este fragmento ganha uma tag para usar dentro dos textos.'}
      </p>
      {notice ? <p className="text-sm">{notice}</p> : null}
      <Field label="Título">
        <TextInput value={title} onChange={(event) => setTitle(event.target.value)} required />
      </Field>
      <Field label="Modelo">
        <select
          className="rounded-xl border border-line bg-white px-3 py-2"
          value={contentTypeId}
          onChange={(event) => setContentTypeId(event.target.value)}
        >
          <option value="">Sem modelo</option>
          {models.map((model) => (
            <option key={model.id} value={model.id}>{model.label}</option>
          ))}
        </select>
      </Field>
      {contentTypeId ? (
        <ContentFields key={contentTypeId} fields={fields} data={data} onChange={setData} />
      ) : (
        <Field label="Dados">
          <textarea
            className="min-h-40 w-full rounded-xl border border-line bg-white px-3 py-2 font-mono text-sm"
            value={rawData}
            onChange={(event) => setRawData(event.target.value)}
          />
        </Field>
      )}
    </form>
  );
}

function ContentFields({
  fields,
  data,
  onChange,
}: {
  fields: FieldDefinition[];
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {fields.map((field) => (
        <ContentFieldInput key={field.name} field={field} value={data[field.name]} onChange={(value) => onChange({ ...data, [field.name]: value })} />
      ))}
    </div>
  );
}

function ContentFieldInput({ field, value, onChange }: { field: FieldDefinition; value: unknown; onChange: (value: unknown) => void }) {
  const label = field.label ?? field.name;
  if (field.type === 'boolean') {
    return <BooleanOption field={field} checked={value === true} onChange={onChange} />;
  }
  if (field.type === 'richtext') {
    return <RichTextField label={label} value={value} onChange={onChange} />;
  }
  if (field.type === 'enum') {
    return (
      <Field label={label}>
        <select className="rounded-xl border border-line bg-white px-3 py-2" value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)}>
          <option value="">{field.required ? 'Escolha' : 'Nenhum'}</option>
          {(field.enumValues ?? []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </Field>
    );
  }
  if (field.type === 'integer' || field.type === 'decimal') {
    return (
      <Field label={label}>
        <TextInput
          type="number"
          step={field.type === 'integer' ? 1 : 'any'}
          value={typeof value === 'number' ? String(value) : ''}
          onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
          required={field.required}
        />
      </Field>
    );
  }
  if (field.type === 'text' || field.type === 'url' || field.type === 'email' || field.type === 'date' || field.type === 'datetime') {
    const inputType = field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : field.type === 'date' ? 'date' : field.type === 'datetime' ? 'datetime-local' : 'text';
    return (
      <Field label={label}>
        <TextInput type={inputType} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} required={field.required} />
      </Field>
    );
  }
  if (field.type === 'object' && field.fields) {
    const record = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    return (
      <Panel title={label}>
        <ContentFields fields={field.fields} data={record} onChange={onChange} />
      </Panel>
    );
  }
  return <JsonValueField label={label} value={value} onChange={onChange} />;
}

function JsonValueField({ label, value, onChange }: { label: string; value: unknown; onChange: (value: unknown) => void }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [error, setError] = useState('');
  return (
    <Field label={label}>
      <textarea
        className="min-h-24 w-full rounded-xl border border-line bg-white px-3 py-2 font-mono text-sm"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          try {
            onChange(JSON.parse(event.target.value));
            setError('');
          } catch {
            setError('JSON inválido.');
          }
        }}
      />
      {error ? <p className="text-sm text-clay">{error}</p> : null}
    </Field>
  );
}

function ExperienceFragmentEditor({ siteId }: { siteId: string }) {
  const { fragmentId } = useParams();
  const navigate = useNavigate();
  const token = useSession((state) => state.token);
  const locale = useSession((state) => state.locale);
  const queryClient = useQueryClient();
  const fragment = useQuery({
    queryKey: ['experience-fragment', siteId, fragmentId],
    enabled: Boolean(fragmentId),
    queryFn: () => api(`/v1/management/sites/${siteId}/experience-fragments/${fragmentId}`, { token }),
  });
  const [history, setHistory] = useState<HistoryState | null>(null);
  const [title, setTitle] = useState('Novo fragmento');
  const [path, setPath] = useState('');
  const [version, setVersion] = useState<number | null>(null);
  const [status, setStatus] = useState('draft');
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const loadedId = useRef<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor));

  useEffect(() => {
    if (!fragmentId) {
      if (loadedId.current === 'new') return;
      loadedId.current = 'new';
      setSelected(null);
      setNotice('');
      setHistory(createHistory(emptyDocument({ id: 'novo', type: 'experienceFragment', title: 'Novo fragmento' })));
      setTitle('Novo fragmento');
      setPath('');
      setVersion(null);
      setStatus('draft');
      return;
    }
    const row = fragment.data as { id: string; title: string; path: string; version: number; status: string; document: CanonicalDocument } | undefined;
    if (!row || row.id !== fragmentId || loadedId.current === fragmentId) return;
    loadedId.current = fragmentId;
    setSelected(null);
    setNotice('');
    setTitle(row.title);
    setPath(row.path);
    setVersion(row.version);
    setStatus(row.status);
    setHistory(createHistory(row.document));
  }, [fragment.data, fragmentId]);

  const save = useMutation({
    mutationFn: () => {
      if (!history) throw new Error('Fragmento ainda não carregou.');
      const document = { ...history.present, metadata: { ...history.present.metadata, title } };
      if (!fragmentId) {
        return api(`/v1/management/sites/${siteId}/experience-fragments`, {
          method: 'POST',
          token,
          body: { title, path: path || undefined, document },
        });
      }
      return api(`/v1/management/sites/${siteId}/experience-fragments/${fragmentId}`, {
        method: 'PATCH',
        token,
        body: { title, path: path || undefined, document, expectedVersion: version ?? undefined },
      });
    },
    onSuccess: (saved: { id: string; title: string; path: string; version: number; status: string; document: CanonicalDocument }) => {
      setTitle(saved.title);
      setPath(saved.path);
      setVersion(saved.version);
      setStatus(saved.status);
      setHistory(createHistory(saved.document));
      setNotice('Fragmento salvo.');
      loadedId.current = saved.id;
      queryClient.invalidateQueries({ queryKey: ['experience-fragments', siteId] });
      if (!fragmentId) navigate(`/sites/${siteId}/fragments/experience/${saved.id}`, { replace: true });
    },
    onError: (error: Error) => setNotice(error.message),
  });
  const publish = useMutation({
    mutationFn: () => api(`/v1/management/sites/${siteId}/experience-fragments/${fragmentId}/publish`, { method: 'POST', token }),
    onSuccess: (saved: { status: string; updatedPages?: string[] }) => {
      setStatus(saved.status);
      setNotice(publishNotice(saved.updatedPages));
      queryClient.invalidateQueries({ queryKey: ['experience-fragments', siteId] });
    },
    onError: (error: Error) => setNotice(error.message),
  });

  if (fragmentId && fragment.isError) return <p>Não foi possível abrir este fragmento.</p>;
  if (!history) return <p>Carregando o fragmento…</p>;
  const section = history.present.slots.main?.sections[0];
  const selectedNode = section?.children.find((node) => node.id === selected);
  return (
    <DndContext
      sensors={sensors}
      onDragEnd={(event) => {
        const blockName = String(event.active.id).replace(/^library:/, '');
        const definition = componentCatalog.find((item) => item.name === blockName);
        if (!definition || !section) return;
        setHistory(historyCommit(history, { type: 'insert', sectionId: section.id, node: nodeFromCatalog(definition) }));
      }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl">{title}</h1>
        <div className="flex gap-2">
          <Link className="rounded-full bg-white px-4 py-2 text-sm" to={`/sites/${siteId}/fragments`}>Voltar</Link>
          <Button variant="ghost" onClick={() => setHistory(historyUndo(history))}>Desfazer</Button>
          <Button variant="ghost" onClick={() => setHistory(historyRedo(history))}>Refazer</Button>
          <Button
            variant={selected ? 'ghost' : 'primary'}
            onClick={() => setSelected(null)}
          >
            {t('properties', locale)}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{t('save', locale)}</Button>
          <Button onClick={() => publish.mutate()} disabled={!fragmentId || publish.isPending}>{t('publish', locale)}</Button>
        </div>
      </div>
      <p className="mb-3 text-sm text-ink/60">{path || 'O caminho é definido ao salvar.'} · {statusLabel(status)}</p>
      <p className="mb-3 text-sm text-ink/60">{t('canvasNote', locale)}</p>
      {notice ? <p className="mb-3 text-sm">{notice}</p> : null}
      <div className="grid gap-3 lg:grid-cols-[220px_1fr_320px]">
        <aside className="rounded-3xl border border-line bg-white p-3">
          <h2 className="mb-2 font-serif text-xl">{t('library', locale)}</h2>
          <div className="flex max-h-[32rem] flex-col gap-1 overflow-auto">
            {componentCatalog.map((item) => (
              <LibraryButton
                key={item.name}
                item={item}
                onInsert={() => {
                  if (!section) return;
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
            if (!definition || !section) return;
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
        <aside className="max-h-[40rem] overflow-auto rounded-3xl border border-line bg-white p-3">
          <h2 className="mb-2 font-serif text-xl">{selectedNode ? t('inspector', locale) : t('properties', locale)}</h2>
          {selectedNode && selectedNode.type !== 'fragmentReference' ? (
            <Inspector
              siteId={siteId}
              definition={definitionFor(selectedNode)}
              nodeId={selectedNode.id}
              value={selectedNode.data}
              onChange={(data) =>
                setHistory(historyCommit(history, { type: 'update', sectionId: section?.id, nodeId: selectedNode.id, patch: { data } }))
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              <Field label={t('pageTitle', locale)}>
                <TextInput value={title} onChange={(event) => setTitle(event.target.value)} required />
              </Field>
              <Field label={t('path', locale)}>
                <TextInput value={path} onChange={(event) => setPath(event.target.value)} placeholder="/fragments/nome" />
              </Field>
              <p className="text-sm text-ink/60">Selecione um bloco para editar o conteúdo dele.</p>
            </div>
          )}
        </aside>
      </div>
    </DndContext>
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

