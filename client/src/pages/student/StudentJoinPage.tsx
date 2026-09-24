import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, CloudDownload, QrCode, Search, WifiOff } from 'lucide-react';
import { joinActivity, isValidCodeFormat } from '../../services/join';
import { ApiError } from '../../lib/api';
import { Badge, Button, Card, Field, Input, PageHeader } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { useConnection } from '../../context/ConnectionContext';

export function StudentJoinPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState<{ title: string; id: string; fromCache: boolean } | null>(
    null,
  );
  const [queued, setQueued] = useState<string | null>(null);
  const toast = useToast();
  const navigate = useNavigate();
  const { isOnline } = useConnection();

  const runJoin = async (rawCode: string) => {
    const result = await joinActivity(rawCode);
    if (result.status === 'queued') {
      setQueued(result.code);
      return result;
    }
    setQueued(null);
    setJoined({
      title: result.activity.title,
      id: result.activity.id,
      fromCache: result.fromCache,
    });
    return result;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    setError(null);

    if (!isValidCodeFormat(normalized)) {
      setError('Enter a valid code like CS-7K4P');
      return;
    }

    setJoining(true);
    try {
      const result = await runJoin(normalized);
      if (result.status === 'queued') {
        toast.info(
          "You're offline — join queued. We'll download this activity when you're back online.",
        );
      } else {
        toast.success(
          result.fromCache
            ? 'Found in your offline cache'
            : 'Activity downloaded and saved for offline use',
        );
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not join this activity';
      setError(message);
    } finally {
      setJoining(false);
    }
  };

  // A queued join completes automatically as soon as the connection returns.
  useEffect(() => {
    if (!isOnline || !queued || joining) return;
    let cancelled = false;
    setJoining(true);
    (async () => {
      try {
        const result = await runJoin(queued);
        if (!cancelled && result.status === 'joined') {
          toast.success('Back online — activity downloaded and saved for offline use');
        }
      } catch (err) {
        if (cancelled) return;
        setQueued(null);
        setError(err instanceof ApiError ? err.message : 'Could not join this activity');
      } finally {
        if (!cancelled) setJoining(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, queued]);

  if (joined) {
    return (
      <div className="animate-fade-in-up">
        <PageHeader title="Activity found" subtitle="Ready for offline use" />
        <Card className="flex w-full flex-col items-start py-8 text-left">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-lg font-bold text-slate-900">{joined.title}</h2>
          <p className="mt-1 w-full text-sm leading-relaxed text-slate-500">
            {joined.fromCache
              ? 'Loaded from your device cache — available with no internet.'
              : 'Downloaded and cached. You can open this activity even with the internet off.'}
          </p>
          <Badge tone="success" className="mt-3">
            <CloudDownload className="h-3 w-3" aria-hidden="true" />
            {joined.fromCache ? 'Cached on device' : 'Saved offline'}
          </Badge>
          <div className="mt-6 flex w-full flex-col gap-2">
            <Button onClick={() => navigate(`/student/activities/${joined.id}`)}>Open activity</Button>
            <Button variant="secondary" onClick={() => { setJoined(null); setCode(''); }}>
              Join another
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (queued) {
    return (
      <div className="animate-fade-in-up">
        <PageHeader title="Join queued" subtitle="Finishes when you're back online" />
        <Card className="flex w-full flex-col items-start py-8 text-left">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <Clock className="h-8 w-8" aria-hidden="true" />
          </span>
          <h2 className="mt-4 font-mono text-lg font-bold tracking-[0.15em] text-slate-900">
            {queued}
          </h2>
          <p className="mt-1 w-full text-sm leading-relaxed text-slate-500">
            {isOnline
              ? 'Downloading this activity now…'
              : "You're offline right now. This code is saved on your device and the activity downloads automatically the moment you reconnect."}
          </p>
          <Badge tone={isOnline ? 'info' : 'warning'} className="mt-3">
            {isOnline ? (
              <>
                <Search className="h-3 w-3" aria-hidden="true" />
                Downloading
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" aria-hidden="true" />
                Waiting for connection
              </>
            )}
          </Badge>
          <div className="mt-6 flex w-full flex-col gap-2">
            <Button
              block
              loading={joining}
              onClick={() => {
                setError(null);
                void (async () => {
                  setJoining(true);
                  try {
                    const result = await runJoin(queued);
                    if (result.status === 'queued') {
                      toast.info("Still offline — the join stays queued.");
                    } else {
                      toast.success('Activity downloaded and saved for offline use');
                    }
                  } catch (err) {
                    setQueued(null);
                    setError(err instanceof ApiError ? err.message : 'Could not join this activity');
                  } finally {
                    setJoining(false);
                  }
                })();
              }}
            >
              {isOnline ? 'Check now' : 'Try again'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setQueued(null);
                setCode('');
                setError(null);
              }}
            >
              Join another code
            </Button>
          </div>
        </Card>
        <p className="mt-4 text-xs text-slate-400">
          Queued joins also finish in the background — see{' '}
          <Link to="/student/activities" className="font-semibold text-teal-700 hover:underline">
            My Activities
          </Link>{' '}
          after reconnecting.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Join activity" subtitle="Enter the code from your teacher" />

      <Card className="mb-4 flex w-full items-center gap-4 py-6 text-left">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
          <QrCode className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-mono text-lg font-bold tracking-[0.25em] text-slate-300">CS-••••</p>
          <p className="mt-1 text-xs text-slate-500">Example: CS-7K4P</p>
        </div>
      </Card>

      <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
        <Field
          label="Activity code"
          htmlFor="join-code"
          required
          error={error ?? undefined}
          hint={
            isOnline
              ? 'Codes are case-insensitive'
              : 'Offline: cached codes join instantly, new codes are queued'
          }
        >
          <Input
            id="join-code"
            name="code"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="CS-7K4P"
            className="font-mono text-lg font-bold tracking-[0.2em] uppercase"
            value={code}
            onChange={(event) => {
              setCode(event.target.value.toUpperCase());
              setError(null);
            }}
            maxLength={10}
            aria-describedby={error ? 'join-code-error' : undefined}
          />
        </Field>
        <Button type="submit" block loading={joining}>
          <Search className="h-4 w-4" aria-hidden="true" />
          {joining ? 'Looking up...' : 'Find activity'}
        </Button>
      </form>

      <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">
        <p className="font-semibold text-slate-700">How offline mode works</p>
        <ol className="mt-1.5 list-inside list-decimal space-y-1">
          <li>Join with a code — works online, or queues automatically while you&apos;re offline.</li>
          <li>Queued codes download the moment you reconnect; cached codes open instantly.</li>
          <li>Answer questions — every answer saves locally right away.</li>
          <li>Submit — it&apos;s queued safely and syncs the moment you&apos;re online.</li>
        </ol>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Looking for your saved activities?{' '}
        <Link to="/student/activities" className="font-semibold text-teal-700 hover:underline">
          My Activities
        </Link>
      </p>
    </div>
  );
}
