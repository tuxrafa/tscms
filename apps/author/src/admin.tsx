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
  ['pages.create', 'Criar'],
  ['pages.edit', 'Editar'],
  ['pages.publish', 'Publicar'],
  ['pages.unpublish', 'Despublicar'],
  ['pages.delete', 'Excluir'],
  ['users.invite', 'Convidar'],
  ['audit.read', 'Ver auditoria'],
];

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
  const [form, setForm] = useState({ name: '', email: '', folderId: '', permissions: 'pages.read,pages.create,pages.edit' });
  const [invite, setInvite] = useState('');
  const [error, setError] = useState('');
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api('/v1/management/sites', { token }) as Promise<{ data: { id: string; name: string }[] }> });
  const siteId = sites.data?.data[0]?.id;
  const create = useMutation({
    mutationFn: () =>
      api(`/v1/management/organizations/${organizationId}/users`, {
        method: 'POST',
        token,
        body: {
          name: form.name,
          email: form.email,
          grant: siteId
            ? {
                siteId,
                scopeType: form.folderId ? 'page_folder' : 'site',
                scopeId: form.folderId || null,
                includeDescendants: true,
                permissions: form.permissions.split(',').map((item) => item.trim()).filter(Boolean),
              }
            : undefined,
        },
      }),
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
          <Field label="Pasta (opcional)"><TextInput value={form.folderId} onChange={(event) => setForm({ ...form, folderId: event.target.value })} /></Field>
          <Field label="Permissões"><TextInput value={form.permissions} onChange={(event) => setForm({ ...form, permissions: event.target.value })} /></Field>
          <Button type="submit">Convidar</Button>
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
