import React, { useState, useEffect } from 'react';
import {
  Terminal, CheckCircle2, Circle, ArrowRight, Copy, Check, RefreshCcw
} from 'lucide-react';
import { StatusInfo } from '../utils/types';

interface OnboardingViewProps {
  onComplete: () => void;
  getStatus: () => Promise<StatusInfo | null>;
}

type Step = 'welcome' | 'shell' | 'verify' | 'terminals' | 'done';

export function OnboardingView({ onComplete, getStatus }: OnboardingViewProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [checking, setChecking] = useState(false);

  const shellCommand = 'eval "$(sessionctl init zsh)"';
  const bashCommand = 'eval "$(sessionctl init bash)"';

  const handleCopy = async (cmd: string) => {
    await navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const checkStatus = async () => {
    setChecking(true);
    const s = await getStatus();
    setStatus(s);
    setChecking(false);
    return s;
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const steps: { id: Step; label: string }[] = [
    { id: 'welcome', label: 'Welcome' },
    { id: 'shell', label: 'Shell Setup' },
    { id: 'verify', label: 'Verify' },
    { id: 'terminals', label: 'Terminals' },
    { id: 'done', label: 'Done' },
  ];

  const currentIndex = steps.findIndex(s => s.id === step);

  return (
    <div className="max-w-lg mx-auto py-12 px-6">
      {/* Progress */}
      <div className="flex items-center justify-center gap-2 mb-10">
        {steps.map((s, i) => (
          <React.Fragment key={s.id}>
            {i > 0 && <div className={`w-8 h-px ${i <= currentIndex ? 'bg-sctl-accent' : 'bg-sctl-border'}`} />}
            <div className="flex items-center gap-1.5">
              {i < currentIndex ? (
                <CheckCircle2 className="w-5 h-5 text-sctl-green" />
              ) : i === currentIndex ? (
                <div className="w-5 h-5 rounded-full bg-sctl-accent flex items-center justify-center">
                  <span className="text-[10px] text-sctl-bg font-bold">{i + 1}</span>
                </div>
              ) : (
                <Circle className="w-5 h-5 text-sctl-border" />
              )}
              <span className={`text-xs ${i <= currentIndex ? 'text-sctl-text' : 'text-sctl-textMuted'}`}>
                {s.label}
              </span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Step content */}
      <div className="animate-fade-in">
        {step === 'welcome' && (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-sctl-accent/20 flex items-center justify-center mx-auto">
              <Terminal className="w-8 h-8 text-sctl-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-bold mb-2">Welcome to SessionCtl</h1>
              <p className="text-sctl-textMuted">
                Mission Control for your AI terminal sessions. See all your sessions at a glance,
                switch in one click, and never lose track of a repo again.
              </p>
            </div>
            <button className="btn-primary mx-auto flex items-center gap-2" onClick={() => setStep('shell')}>
              Get Started <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === 'shell' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold mb-2">Install Shell Companion</h2>
              <p className="text-sctl-textMuted text-sm">
                Add one line to your shell config. This tells your terminal to report session info to SessionCtl.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-sctl-textMuted mb-1 block">For zsh (~/.zshrc)</label>
                <div className="flex items-center gap-2 bg-sctl-bg border border-sctl-border rounded-lg px-3 py-2.5">
                  <code className="flex-1 text-sm font-mono text-sctl-green">{shellCommand}</code>
                  <button
                    className="p-1.5 hover:bg-sctl-surfaceHover rounded"
                    onClick={() => handleCopy(shellCommand)}
                  >
                    {copied ? <Check className="w-4 h-4 text-sctl-green" /> : <Copy className="w-4 h-4 text-sctl-textMuted" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-sctl-textMuted mb-1 block">For bash (~/.bashrc)</label>
                <div className="flex items-center gap-2 bg-sctl-bg border border-sctl-border rounded-lg px-3 py-2.5">
                  <code className="flex-1 text-sm font-mono text-sctl-green">{bashCommand}</code>
                  <button
                    className="p-1.5 hover:bg-sctl-surfaceHover rounded"
                    onClick={() => handleCopy(bashCommand)}
                  >
                    <Copy className="w-4 h-4 text-sctl-textMuted" />
                  </button>
                </div>
              </div>
            </div>

            <p className="text-xs text-sctl-textMuted">
              After adding the line, open a new terminal window or run <code className="text-sctl-accent">source ~/.zshrc</code>.
            </p>

            <div className="flex justify-between">
              <button className="btn-secondary" onClick={() => setStep('welcome')}>Back</button>
              <button className="btn-primary flex items-center gap-2" onClick={() => setStep('verify')}>
                Next <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 'verify' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold mb-2">Verify Connection</h2>
              <p className="text-sctl-textMuted text-sm">
                Open a new terminal and check if SessionCtl detects it.
              </p>
            </div>

            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Active Sessions</span>
                <span className={`text-sm font-mono ${(status?.activeSessions ?? 0) > 0 ? 'text-sctl-green' : 'text-sctl-yellow'}`}>
                  {status?.activeSessions ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Shell Companion</span>
                <span className={`text-sm ${status?.shellCompanionInstalled ? 'text-sctl-green' : 'text-sctl-yellow'}`}>
                  {status?.shellCompanionInstalled ? 'Detected' : 'Not detected yet'}
                </span>
              </div>
            </div>

            <button
              className="btn-secondary w-full flex items-center justify-center gap-2"
              onClick={checkStatus}
              disabled={checking}
            >
              <RefreshCcw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Checking...' : 'Check Again'}
            </button>

            <div className="flex justify-between">
              <button className="btn-secondary" onClick={() => setStep('shell')}>Back</button>
              <button className="btn-primary flex items-center gap-2" onClick={() => setStep('terminals')}>
                {(status?.activeSessions ?? 0) > 0 ? 'Looks good!' : 'Skip for now'} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 'terminals' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold mb-2">Terminal Integration</h2>
              <p className="text-sctl-textMuted text-sm">
                SessionCtl works with iTerm2 and Terminal.app. It can set badges, focus windows, and launch sessions.
              </p>
            </div>

            <div className="space-y-2">
              {(['iterm2', 'terminal'] as const).map(app => (
                <div key={app} className="card px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Terminal className="w-5 h-5 text-sctl-accent" />
                    <div>
                      <div className="text-sm font-medium">{app === 'iterm2' ? 'iTerm2' : 'Terminal.app'}</div>
                      <div className="text-xs text-sctl-textMuted">
                        {app === 'iterm2' ? 'Badge + focus + managed launch' : 'Title + focus + managed launch'}
                      </div>
                    </div>
                  </div>
                  {status?.detectedTerminals?.includes(app) ? (
                    <span className="text-xs text-sctl-green font-medium">Detected</span>
                  ) : (
                    <span className="text-xs text-sctl-textMuted">Not running</span>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-between">
              <button className="btn-secondary" onClick={() => setStep('verify')}>Back</button>
              <button className="btn-primary flex items-center gap-2" onClick={() => setStep('done')}>
                Finish <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-sctl-green/20 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-sctl-green" />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">You're all set!</h2>
              <p className="text-sctl-textMuted">
                SessionCtl is now watching your terminal sessions. Open some terminals and you'll see them appear in the dashboard.
              </p>
            </div>

            <div className="card p-4 text-left space-y-2">
              <h3 className="text-sm font-medium">Quick shortcuts</h3>
              <div className="text-xs text-sctl-textMuted space-y-1">
                <div><kbd className="font-mono bg-sctl-bg px-1.5 py-0.5 rounded">Ctrl+Shift+S</kbd> Toggle this popover</div>
                <div><kbd className="font-mono bg-sctl-bg px-1.5 py-0.5 rounded">Cmd+N</kbd> New session</div>
                <div><kbd className="font-mono bg-sctl-bg px-1.5 py-0.5 rounded">Cmd+1-9</kbd> Quick focus</div>
              </div>
            </div>

            <button className="btn-primary mx-auto" onClick={onComplete}>
              Open Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
