import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Field, Panel, TextInput } from '@tscms/ui';
import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { api, useSession } from './session';

interface OrgUser {
  id: string;
  name: string;
  email: string;
  kind: string;
  status: string;
  role: string;
  groups: { id: string; name: string }[];
  lastLoginAt: string | null;
}

interface GroupRow {
  id: string;
  name: string;
  permissions: string[];
}

interface AuditRow {
  id: string;
  createdAt: string;
  actorName: string | null;
  actorKind: string | null;
  actorType: string;
  action: string;
  result: string;
  resourcePath: string | null;
  entityType: string;
  metadata: Record<string, unknown>;
}

const pagePermissions = [
  ['pages.read', 'Ler'],
  ['pages.edit', 'Modificar'],
  ['pages.create', 'Criar'],
  ['pages.delete', 'Excluir'],
  ['pages.publish', 'Publicar'],
  ['pages.unpublish', 'Despublicar'],
  ['users.invite', 'Convidar'],
  ['audit.read', 'Ver auditoria'],
] as const;

const pathPermissions = pagePermissions.filter(([code]) => code.startsWith('pages.'));

interface FolderOption {
  id: string;
  name: string;
  path: string;
}

function FolderIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-pine" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1.5 3.5A1.5 1.5 0 0 1 3 2h3.2l1.2 1.4H13A1.5 1.5 0 0 1 14.5 4.9v7.1A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V3.5Z" />
    </svg>
  );
}

function PermissionGrid({
  siteName,
  folders,
  checks,
  onToggle,
}: {
  siteName: string;
  folders: FolderOption[];
  checks: Record<string, string[]>;
  onToggle: (scopeKey: string, permission: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const query = filter.trim().toLowerCase();
  const rows = [
    { key: 'site', name: siteName || 'Site', path: '/', depth: 0 },
    ...folders
      .slice()
      .sort((left, right) => left.path.localeCompare(right.path, 'pt-BR'))
      .map((folder) => ({
        key: folder.id,
        name: folder.name,
        path: folder.path,
        depth: Math.max(folder.path.split('/').filter(Boolean).length - 1, 0),
      })),
  ].filter((row) => !query || row.name.toLowerCase().includes(query) || row.path.toLowerCase().includes(query));
  return (
    <div className="flex flex-col gap-2">
      <TextInput value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filtrar caminho" aria-label="Filtrar caminho" />
      <div className="overflow-auto rounded-2xl border border-line">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead className="bg-paper">
            <tr>
              <th className="px-3 py-2 font-medium">Caminho</th>
              {pathPermissions.map(([code, label]) => (
                <th key={code} className="px-2 py-2 text-center font-medium">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-line">
                <td className="px-3 py-2" style={{ paddingLeft: `${12 + row.depth * 16}px` }}>
                  <span className="inline-flex items-center gap-2" title={row.path}>
                    <FolderIcon />
                    <span>{row.name}</span>
                    <span className="text-ink/45">{row.path}</span>
                  </span>
                </td>
                {pathPermissions.map(([code, label]) => {
                  const checked = (checks[row.key] ?? []).includes(code);
                  return (
                    <td key={code} className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${row.path} ${label}`}
                        checked={checked}
                        onChange={() => onToggle(row.key, code)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-ink/60" colSpan={pathPermissions.length + 1}>Nenhuma pasta com esse nome.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function useOrg() {
  const token = useSession((state) => state.token);
  return useQuery({
    queryKey: ['orgs'],
    queryFn: () => api('/v1/management/organizations', { token }) as Promise<{ data: { id: string; name: string }[] }>,
  });
}

export function AdminUsers() {
  const token = useSession((state) => state.token);
  const orgs = useOrg();
  const organizationId = orgs.data?.data[0]?.id;
  const users = useQuery({
    queryKey: ['users', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => api(`/v1/management/organizations/${organizationId}/users`, { token }) as Promise<{ data: OrgUser[] }>,
  });
  const [form, setForm] = useState({ name: '', email: '' });
  const [checks, setChecks] = useState<Record<string, string[]>>({ site: ['pages.read', 'pages.create', 'pages.edit'] });
  const [invite, setInvite] = useState('');
  const [error, setError] = useState('');
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api('/v1/management/sites', { token }) as Promise<{ data: { id: string; name: string }[] }> });
  const [siteId, setSiteId] = useState('');
  const selectedSiteId = siteId || sites.data?.data[0]?.id || '';
  const selectedSite = sites.data?.data.find((site) => site.id === selectedSiteId);
  const folders = useQuery({
    queryKey: ['folders', selectedSiteId],
    enabled: Boolean(selectedSiteId),
    queryFn: () => api(`/v1/management/sites/${selectedSiteId}/folders`, { token }) as Promise<{ data: FolderOption[] }>,
  });
  const create = useMutation({
    mutationFn: () => {
      const folderRows = folders.data?.data ?? [];
      const grants = [
        { key: 'site', scopeType: 'site' as const, scopeId: null },
        ...folderRows.map((folder) => ({ key: folder.id, scopeType: 'page_folder' as const, scopeId: folder.id })),
      ]
        .map((row) => ({ ...row, permissions: checks[row.key] ?? [] }))
        .filter((row) => row.permissions.length > 0)
        .map((row) => ({
          siteId: selectedSiteId,
          scopeType: row.scopeType,
          scopeId: row.scopeId,
          includeDescendants: true,
          permissions: row.permissions,
        }));
      if (!selectedSiteId || grants.length === 0) throw new Error('Marque ao menos uma permissão no grid.');
      return api(`/v1/management/organizations/${organizationId}/users`, {
        method: 'POST',
        token,
        body: { name: form.name, email: form.email, grants },
      });
    },
    onSuccess: (result) => {
      setInvite(result.inviteToken ? `${window.location.origin}/tscms/login?invite=${result.inviteToken}` : 'Usuário associado.');
      setError('');
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : 'Falha'),
  });
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-4xl">Usuários</h1>
      <Panel title="Convidar">
        <form
          className="flex flex-col gap-2"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <Field label="Nome"><TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
          <Field label="E-mail"><TextInput type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></Field>
          {(sites.data?.data.length ?? 0) > 1 ? (
            <Field label="Site">
              <select className="rounded-xl border border-line bg-white px-3 py-2" value={selectedSiteId} onChange={(event) => setSiteId(event.target.value)}>
                {(sites.data?.data ?? []).map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
            </Field>
          ) : null}
          <PermissionGrid
            siteName={selectedSite?.name ?? 'Site'}
            folders={folders.data?.data ?? []}
            checks={checks}
            onToggle={(scopeKey, permission) => setChecks((current) => {
              const list = current[scopeKey] ?? [];
              const next = list.includes(permission) ? list.filter((item) => item !== permission) : [...list, permission];
              return { ...current, [scopeKey]: next };
            })}
          />
          <Button type="submit" disabled={create.isPending}>Convidar</Button>
        </form>
        {invite ? <p className="mt-2 break-all text-sm">{invite}</p> : null}
        {error ? <p className="text-sm text-clay">{error}</p> : null}
      </Panel>
      <Panel title="Contas">
        {(users.data?.data ?? []).map((user) => (
          <div key={user.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2">
            <div>
              <p>{user.name} {user.kind === 'service' ? '· automação' : ''}</p>
              <p className="text-sm text-ink/60">{user.email} · {user.status} · {user.groups.map((group) => group.name).join(', ') || user.role}</p>
            </div>
            {user.status === 'active' ? (
              <Button variant="ghost" onClick={() => void api(`/v1/management/users/${user.id}/disable`, { method: 'POST', token }).then(() => users.refetch())}>Desativar</Button>
            ) : (
              <Button variant="ghost" onClick={() => void api(`/v1/management/users/${user.id}/enable`, { method: 'POST', token }).then(() => users.refetch())}>Ativar</Button>
            )}
          </div>
        ))}
      </Panel>
    </div>
  );
}

export function AdminGroups() {
  const token = useSession((state) => state.token);
  const queryClient = useQueryClient();
  const orgs = useOrg();
  const organizationId = orgs.data?.data[0]?.id;
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api('/v1/management/sites', { token }) as Promise<{ data: { id: string; name: string }[] }> });
  const groups = useQuery({
    queryKey: ['groups', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => api(`/v1/management/organizations/${organizationId}/groups`, { token }) as Promise<{ data: GroupRow[] }>,
  });
  const [name, setName] = useState('Editores de notícias');
  const [folderId, setFolderId] = useState('');
  const [selected, setSelected] = useState<string[]>(['pages.read', 'pages.create', 'pages.edit']);
  const [error, setError] = useState('');
  const siteId = sites.data?.data[0]?.id;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-4xl">Grupos</h1>
      <Panel title="Novo grupo">
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void api(`/v1/management/organizations/${organizationId}/groups`, {
              method: 'POST',
              token,
              body: {
                name,
                permissions: selected,
                siteId,
                scopeType: folderId ? 'page_folder' : 'site',
                scopeId: folderId || null,
                includeDescendants: true,
              },
            })
              .then(() => {
                setError('');
                return queryClient.invalidateQueries({ queryKey: ['groups', organizationId] });
              })
              .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Falha'));
          }}
        >
          <Field label="Nome"><TextInput value={name} onChange={(event) => setName(event.target.value)} required /></Field>
          <Field label="Pasta"><TextInput value={folderId} onChange={(event) => setFolderId(event.target.value)} /></Field>
          <div className="flex flex-col gap-1">
            {pagePermissions.map(([code, label]) => (
              <label key={code} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(code)}
                  onChange={(event) => setSelected(event.target.checked ? [...selected, code] : selected.filter((item) => item !== code))}
                />
                {label} <span className="text-ink/50">{code}</span>
              </label>
            ))}
          </div>
          <Button type="submit">Criar grupo</Button>
          {error ? <p className="text-sm text-clay">{error}</p> : null}
        </form>
      </Panel>
      <Panel title="Grupos">
        {(groups.data?.data ?? []).map((group) => (
          <p key={group.id} className="border-b border-line py-2">{group.name}</p>
        ))}
      </Panel>
    </div>
  );
}

export function AdminAudit() {
  const token = useSession((state) => state.token);
  const orgs = useOrg();
  const organizationId = orgs.data?.data[0]?.id;
  const [action, setAction] = useState('');
  const [kind, setKind] = useState('');
  const audit = useQuery({
    queryKey: ['audit', organizationId, action, kind],
    enabled: Boolean(organizationId),
    queryFn: () => {
      const params = new URLSearchParams({ organizationId: organizationId! });
      if (action) params.set('action', action);
      if (kind) params.set('kind', kind);
      return api(`/v1/management/audit?${params}`, { token }) as Promise<{ data: AuditRow[] }>;
    },
  });
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-4xl">Auditoria</h1>
      <div className="flex gap-2">
        <TextInput placeholder="Ação" value={action} onChange={(event) => setAction(event.target.value)} />
        <TextInput placeholder="human ou service" value={kind} onChange={(event) => setKind(event.target.value)} />
      </div>
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th>Quando</th><th>Quem</th><th>Ação</th><th>Resultado</th><th>Caminho</th>
            </tr>
          </thead>
          <tbody>
            {(audit.data?.data ?? []).map((event) => (
              <tr key={event.id} className="border-t border-line">
                <td>{new Date(event.createdAt).toLocaleString('pt-BR')}</td>
                <td>{event.actorName ?? '—'} · {event.actorKind ?? event.actorType}</td>
                <td>{event.action}</td>
                <td>{event.result}</td>
                <td>{event.resourcePath ?? event.entityType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PageHistory({ siteId }: { siteId: string }) {
  const token = useSession((state) => state.token);
  const { pageId } = useParams();
  const history = useQuery({
    queryKey: ['history', siteId, pageId],
    queryFn: () => api(`/v1/management/sites/${siteId}/pages/${pageId}/history`, { token }),
  });
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const events = (history.data?.events ?? []) as AuditRow[];
  const revisions = (history.data?.revisions ?? []) as { id: string; version: number; document: { metadata?: { title?: string } } }[];
  const before = revisions.find((revision) => revision.id === left);
  const after = revisions.find((revision) => revision.id === right);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-4xl">Histórico</h1>
      <Panel title={history.data?.page?.title ?? 'Página'}>
        {events.map((event) => (
          <p key={event.id} className="border-b border-line py-2 text-sm">
            {new Date(event.createdAt).toLocaleString('pt-BR')} — {event.actorName ?? event.actorType} — {event.action}
            {Array.isArray(event.metadata?.changes) ? ` (${(event.metadata.changes as string[]).join(', ')})` : ''}
          </p>
        ))}
      </Panel>
      <Panel title="Comparar revisões">
        <div className="flex gap-2">
          <TextInput placeholder="Revisão A" value={left} onChange={(event) => setLeft(event.target.value)} />
          <TextInput placeholder="Revisão B" value={right} onChange={(event) => setRight(event.target.value)} />
        </div>
        {before && after ? (
          <p className="mt-2 text-sm">
            {before.document.metadata?.title} (v{before.version}) → {after.document.metadata?.title} (v{after.version})
          </p>
        ) : null}
        <ul className="mt-2 text-sm">
          {revisions.map((revision) => <li key={revision.id}>{revision.version} · {revision.id}</li>)}
        </ul>
      </Panel>
    </div>
  );
}
