import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Field, TextInput } from '@tscms/ui';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { t } from './i18n';
import { api, useSession } from './session';
import { confirmsSiteRemoval, isValidSiteName, normalizeSiteName } from './site-name';

export interface SiteSummary {
  id: string;
  name: string;
  key: string;
}

type Mode = 'view' | 'rename' | 'remove';

export function SiteCard({ site }: { site: SiteSummary }) {
  const token = useSession((state) => state.token);
  const locale = useSession((state) => state.locale);
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('view');
  const [name, setName] = useState(site.name);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');

  function close() {
    setMode('view');
    setError('');
    setConfirmation('');
    setName(site.name);
  }

  const rename = useMutation({
    mutationFn: () => api(`/v1/management/sites/${site.id}`, { method: 'PATCH', token, body: { name: normalizeSiteName(name) } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sites'] }),
        queryClient.invalidateQueries({ queryKey: ['site', site.id] }),
      ]);
      setMode('view');
      setError('');
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : 'Falha ao renomear.'),
  });

  const remove = useMutation({
    mutationFn: () => api(`/v1/management/sites/${site.id}`, { method: 'DELETE', token }),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ['site', site.id] });
      await queryClient.invalidateQueries({ queryKey: ['sites'] });
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : 'Falha ao remover.'),
  });

  function submitRename(event: FormEvent) {
    event.preventDefault();
    if (!isValidSiteName(name) || normalizeSiteName(name) === site.name) return;
    rename.mutate();
  }

  function submitRemove(event: FormEvent) {
    event.preventDefault();
    if (!confirmsSiteRemoval(confirmation, site)) return;
    remove.mutate();
  }

  return (
    <article className="flex flex-col gap-3 rounded-3xl border border-line bg-white p-4" data-testid="site-card">
      {mode === 'rename' ? (
        <form className="flex flex-col gap-2" onSubmit={submitRename}>
          <Field label={t('name', locale)}>
            <TextInput value={name} onChange={(event) => setName(event.target.value)} maxLength={160} autoFocus required />
          </Field>
          <p className="text-xs text-ink/60">A chave pública ({site.key}) não muda; só o nome exibido no estúdio.</p>
          {error ? <p className="text-sm text-clay">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={rename.isPending || !isValidSiteName(name) || normalizeSiteName(name) === site.name}>
              {t('save', locale)}
            </Button>
            <Button type="button" variant="ghost" onClick={close}>
              {t('cancel', locale)}
            </Button>
          </div>
        </form>
      ) : (
        <Link to={`/sites/${site.id}`} className="block">
          <h2>{site.name}</h2>
          <p className="text-sm text-ink/60">{site.key}</p>
        </Link>
      )}

      {mode === 'remove' ? (
        <form className="flex flex-col gap-2 rounded-2xl border border-clay/40 bg-clay/5 p-3" onSubmit={submitRemove}>
          <p className="text-sm">
            Remover <strong>{site.name}</strong> tira o site do estúdio e a entrega pública (<code>{site.key}</code>) deixa de responder. Digite o
            nome do site para confirmar.
          </p>
          <TextInput
            aria-label="Confirmar nome do site"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={site.name}
            autoFocus
          />
          {error ? <p className="text-sm text-clay">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" variant="danger" disabled={remove.isPending || !confirmsSiteRemoval(confirmation, site)}>
              {t('remove', locale)}
            </Button>
            <Button type="button" variant="ghost" onClick={close}>
              {t('cancel', locale)}
            </Button>
          </div>
        </form>
      ) : null}

      {mode === 'view' ? (
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => setMode('rename')}>
            {t('rename', locale)}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMode('remove')}>
            {t('remove', locale)}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
