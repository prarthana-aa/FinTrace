import React, { useState, useEffect } from 'react';

export default function HowItWorksView({ onReturnToLive }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [activeSignal, setActiveSignal] = useState(0);
  const [counterValue, setCounterValue] = useState(2);
  const [networkCount, setNetworkCount] = useState(2);
  const [scoreTally, setScoreTally] = useState(0);
  const [isRevealedFP, setIsRevealedFP] = useState(false);

  const steps = [
    { id: '01', title: 'Transaction', subtitle: 'A transaction happens' },
    { id: '02', title: 'Money Flow', subtitle: 'Patterns emerge from repeated transactions' },
    { id: '03', title: 'Signals', subtitle: 'Money moves through the account' },
    { id: '04', title: 'Risk Signals', subtitle: 'TrustGraph measures six behavioral signals' },
    { id: '05', title: 'Risk Score', subtitle: 'Signals combine into a risk score' },
    { id: '06', title: 'Threshold', subtitle: 'When does an account become flagged?' },
    { id: '07', title: 'Network', subtitle: 'Suspicious accounts connect into a network' },
    { id: '08', title: 'False Positive', subtitle: 'Not every flagged account is a mule' },
  ];

  // Animated counter for Step 02 (Fan-in count)
  useEffect(() => {
    if (currentStep !== 1) {
      setCounterValue(2);
      return;
    }
    const sequence = [2, 5, 11, 18];
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % sequence.length;
      setCounterValue(sequence[idx]);
    }, 1200);
    return () => clearInterval(interval);
  }, [currentStep]);

  // Animated counter for Step 07 (Network growth)
  useEffect(() => {
    if (currentStep !== 6) {
      setNetworkCount(2);
      return;
    }
    const sequence = [2, 4, 7, 11, 19];
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % sequence.length;
      setNetworkCount(sequence[idx]);
    }, 1400);
    return () => clearInterval(interval);
  }, [currentStep]);

  // Animated score tally for Step 05
  useEffect(() => {
    if (currentStep !== 4) {
      setScoreTally(0);
      return;
    }
    const target = 53;
    let curr = 0;
    const timer = setInterval(() => {
      if (curr < target) {
        curr += 1;
        setScoreTally(curr);
      } else {
        clearInterval(timer);
      }
    }, 35);
    return () => clearInterval(timer);
  }, [currentStep]);

  // Pause & reveal animation for Step 08
  useEffect(() => {
    if (currentStep !== 7) {
      setIsRevealedFP(false);
      return;
    }
    const timer = setTimeout(() => {
      setIsRevealedFP(true);
    }, 1600);
    return () => clearTimeout(timer);
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  const signalDetails = [
    {
      key: 'struct',
      name: 'STRUCTURING',
      tag: 'Weight 33',
      desc: 'Transactions repeatedly stay just below the reporting threshold (e.g., ₹45,000–₹49,999 vs ₹50,000 limit).',
      svg: (
        <svg viewBox="0 0 280 140" className="signal-mini-svg">
          <line x1="20" y1="40" x2="260" y2="40" stroke="#ff4d5e" strokeDasharray="4,4" strokeWidth="1.5" />
          <text x="25" y="32" fill="#ff4d5e" fontSize="10" fontWeight="bold">REPORTING LIMIT (₹50k)</text>
          <rect x="50" y="48" width="30" height="70" fill="rgba(91,140,255,0.7)" rx="4" />
          <text x="52" y="132" fill="#8b98ad" fontSize="9">₹47.5k</text>
          <rect x="110" y="44" width="30" height="74" fill="rgba(91,140,255,0.85)" rx="4" />
          <text x="112" y="132" fill="#8b98ad" fontSize="9">₹49.2k</text>
          <rect x="170" y="46" width="30" height="72" fill="rgba(91,140,255,0.85)" rx="4" />
          <text x="172" y="132" fill="#8b98ad" fontSize="9">₹48.8k</text>
        </svg>
      ),
    },
    {
      key: 'hold',
      name: 'HOLD TIME',
      tag: 'Weight 30',
      desc: 'Money leaves soon after arriving (median hold time under 30 minutes).',
      svg: (
        <svg viewBox="0 0 280 140" className="signal-mini-svg">
          <circle cx="60" cy="70" r="18" fill="#6b7fd7" />
          <text x="60" y="74" fill="#fff" fontSize="10" textAnchor="middle" fontWeight="bold">A</text>
          <path d="M 80 70 L 130 70" stroke="#22c39a" strokeWidth="2.5" markerEnd="url(#arrow)" />
          <circle cx="140" cy="70" r="22" fill="#1a2130" stroke="#ff4d5e" strokeWidth="2" />
          <text x="140" y="74" fill="#fff" fontSize="11" textAnchor="middle" fontWeight="bold">B</text>
          <path d="M 164 70 L 214 70" stroke="#ff4d5e" strokeWidth="2.5" />
          <circle cx="224" cy="70" r="18" fill="#b57bff" />
          <text x="224" y="74" fill="#fff" fontSize="10" textAnchor="middle" fontWeight="bold">X</text>
          <rect x="95" y="95" width="90" height="24" rx="12" fill="rgba(255,77,94,0.15)" stroke="rgba(255,77,94,0.4)" />
          <text x="140" y="111" fill="#ff4d5e" fontSize="10" textAnchor="middle" fontWeight="bold">⚡ 4.2 min hold</text>
        </svg>
      ),
    },
    {
      key: 'fanin',
      name: 'FAN-IN',
      tag: 'Weight 19',
      desc: 'Many distinct accounts send money to one central receiving account.',
      svg: (
        <svg viewBox="0 0 280 140" className="signal-mini-svg">
          <circle cx="40" cy="30" r="12" fill="#6b7fd7" />
          <circle cx="40" cy="70" r="12" fill="#6b7fd7" />
          <circle cx="40" cy="110" r="12" fill="#6b7fd7" />
          <line x1="52" y1="35" x2="195" y2="65" stroke="#5b8cff" strokeWidth="1.5" />
          <line x1="52" y1="70" x2="195" y2="70" stroke="#5b8cff" strokeWidth="1.5" />
          <line x1="52" y1="105" x2="195" y2="75" stroke="#5b8cff" strokeWidth="1.5" />
          <circle cx="210" cy="70" r="22" fill="#ff4d5e" />
          <text x="210" y="74" fill="#fff" fontSize="10" textAnchor="middle" fontWeight="bold">HUB</text>
          <text x="110" y="25" fill="#8b98ad" fontSize="10">18 distinct senders</text>
        </svg>
      ),
    },
    {
      key: 'velocity',
      name: 'VELOCITY VS AGE',
      tag: 'Weight 13',
      desc: 'Unusually intense transaction activity over a short period on a newly opened account.',
      svg: (
        <svg viewBox="0 0 280 140" className="signal-mini-svg">
          <rect x="30" y="30" width="220" height="80" rx="8" fill="#131824" stroke="rgba(255,255,255,0.08)" />
          <path d="M 40 90 Q 90 85 120 70 T 170 35 T 230 30" fill="none" stroke="#ff4d5e" strokeWidth="3" />
          <circle cx="170" cy="35" r="5" fill="#ff4d5e" />
          <text x="50" y="55" fill="#8b98ad" fontSize="10">12 txns in 1 hour</text>
          <text x="50" y="72" fill="#ff4d5e" fontSize="10" fontWeight="bold">Account Age: 14 days</text>
        </svg>
      ),
    },
    {
      key: 'fanout',
      name: 'FAN-OUT',
      tag: 'Weight 3',
      desc: 'Money is rapidly distributed from one central account to multiple receivers.',
      svg: (
        <svg viewBox="0 0 280 140" className="signal-mini-svg">
          <circle cx="50" cy="70" r="20" fill="#ff4d5e" />
          <text x="50" y="74" fill="#fff" fontSize="10" textAnchor="middle" fontWeight="bold">SRC</text>
          <line x1="70" y1="65" x2="215" y2="30" stroke="#5b8cff" strokeWidth="1.5" />
          <line x1="70" y1="70" x2="215" y2="70" stroke="#5b8cff" strokeWidth="1.5" />
          <line x1="70" y1="75" x2="215" y2="110" stroke="#5b8cff" strokeWidth="1.5" />
          <circle cx="230" cy="30" r="12" fill="#6b7fd7" />
          <circle cx="230" cy="70" r="12" fill="#6b7fd7" />
          <circle cx="230" cy="110" r="12" fill="#6b7fd7" />
          <text x="130" y="125" fill="#8b98ad" fontSize="10">Multiple non-merchant receivers</text>
        </svg>
      ),
    },
    {
      key: 'mismatch',
      name: 'CATEGORY / TYPE MISMATCH',
      tag: 'Weight 2',
      desc: 'Account activity deviates completely from expected type (e.g. personal account acting as merchant hub).',
      svg: (
        <svg viewBox="0 0 280 140" className="signal-mini-svg">
          <rect x="40" y="35" width="200" height="70" rx="8" fill="#131824" stroke="#ff4d5e" strokeWidth="1" />
          <text x="140" y="60" fill="#e7ecf3" fontSize="12" textAnchor="middle" fontWeight="bold">Type: Personal Account</text>
          <text x="140" y="80" fill="#ff4d5e" fontSize="11" textAnchor="middle" fontWeight="bold">⚠ Operating as high-volume merchant hub</text>
        </svg>
      ),
    },
  ];

  return (
    <div className="story-container">
      {/* Header */}
      <header className="story-header">
        <div className="story-brand-row">
          <button className="story-back-btn" onClick={onReturnToLive}>
            ← Live Detection
          </button>
          <div className="story-nav-pills">
            <button className="story-tab" onClick={onReturnToLive}>
              LIVE DETECTION
            </button>
            <button className="story-tab active">
              HOW IT WORKS
            </button>
          </div>
        </div>

        <div className="story-hero">
          <div className="story-hero-badge">RULE-BASED · EXPLAINABLE · NO ML BLACK BOX</div>
          <h1 className="story-title">How TrustGraph Detects a Fraud Network</h1>
          <p className="story-subtitle">From one transaction → suspicious behavior → connected network</p>
          <p className="story-desc">
            "TrustGraph looks at the <strong>SHAPE of money movement</strong> across accounts — not just individual transactions."
          </p>
        </div>
      </header>

      {/* Main Walkthrough Grid */}
      <div className="story-main">
        {/* Sidebar Step Progress Indicator */}
        <aside className="story-sidebar">
          <div className="story-sidebar-title">WALKTHROUGH STEPS</div>
          <div className="story-step-list">
            {steps.map((step, idx) => {
              const isActive = idx === currentStep;
              const isPast = idx < currentStep;
              return (
                <button
                  key={step.id}
                  className={`story-step-item ${isActive ? 'active' : ''} ${isPast ? 'past' : ''}`}
                  onClick={() => setCurrentStep(idx)}
                >
                  <span className="story-step-num">{step.id}</span>
                  <div className="story-step-info">
                    <span className="story-step-name">{step.title}</span>
                    <span className="story-step-sub">{step.subtitle}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Story Content Area */}
        <main className="story-content-panel">
          <div className="story-step-header">
            <span className="story-step-badge">STEP {steps[currentStep].id} OF 08</span>
            <h2 className="story-step-heading">{steps[currentStep].subtitle}</h2>
          </div>

          {/* STEP 01 */}
          {currentStep === 0 && (
            <div className="story-step-body animate-fade-in">
              <div className="story-vis-card">
                <div className="story-vis-legend">
                  <span className="badge-callout">NODE = ACCOUNT</span>
                  <span className="badge-callout">LINE = TRANSACTION</span>
                  <span className="badge-callout">ARROW = MONEY FLOW</span>
                </div>
                <div className="story-vis-canvas">
                  <svg viewBox="0 0 550 220" className="story-svg">
                    <defs>
                      <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#22c39a" />
                      </marker>
                    </defs>
                    <g transform="translate(110, 110)">
                      <circle r="36" fill="#131824" stroke="#6b7fd7" strokeWidth="3" />
                      <circle r="18" fill="#6b7fd7" opacity="0.3" />
                      <text textAnchor="middle" y="5" fill="#fff" fontWeight="bold" fontSize="13">A</text>
                      <text textAnchor="middle" y="55" fill="#8b98ad" fontSize="12">Account A</text>
                      <text textAnchor="middle" y="70" fill="#6b7fd7" fontSize="10" fontWeight="bold">Personal</text>
                    </g>
                    <path d="M 150 110 L 390 110" stroke="#22c39a" strokeWidth="3" markerEnd="url(#arrow)" className="anim-tx-line" />
                    <rect x="230" y="85" width="90" height="26" rx="13" fill="#0f1622" stroke="#22c39a" strokeWidth="1" />
                    <text x="275" y="102" fill="#22c39a" fontSize="12" fontWeight="bold" textAnchor="middle">₹2,400</text>
                    <g transform="translate(430, 110)">
                      <circle r="36" fill="#131824" stroke="#6b7fd7" strokeWidth="3" />
                      <circle r="18" fill="#6b7fd7" opacity="0.3" />
                      <text textAnchor="middle" y="5" fill="#fff" fontWeight="bold" fontSize="13">B</text>
                      <text textAnchor="middle" y="55" fill="#8b98ad" fontSize="12">Account B</text>
                      <text textAnchor="middle" y="70" fill="#6b7fd7" fontSize="10" fontWeight="bold">Personal</text>
                    </g>
                  </svg>
                </div>
              </div>

              <div className="story-explanation-box">
                <p>• Every transaction becomes a connection between two accounts in the global financial graph.</p>
                <p>• A single individual transaction is not necessarily suspicious or harmful.</p>
                <p>• TrustGraph looks at how an account behaves across many transactions over time.</p>
              </div>

              <div className="story-takeaway">
                <span className="takeaway-label">KEY TAKEAWAY</span>
                <p>"One transaction is noise. Repeated structural patterns reveal behavior."</p>
              </div>
            </div>
          )}

          {/* STEP 02 */}
          {currentStep === 1 && (
            <div className="story-step-body animate-fade-in">
              <div className="story-vis-card">
                <div className="story-counter-badge">
                  <span className="k">FAN-IN (Distinct Senders)</span>
                  <span className="v">{counterValue}</span>
                </div>
                <div className="story-vis-canvas">
                  <svg viewBox="0 0 550 240" className="story-svg">
                    {/* Senders */}
                    {['A', 'C', 'D', 'E', 'F'].map((label, idx) => {
                      const cy = 40 + idx * 40;
                      return (
                        <g key={label} transform={`translate(100, ${cy})`}>
                          <circle r="16" fill="#6b7fd7" />
                          <text textAnchor="middle" y="4" fill="#fff" fontSize="11" fontWeight="bold">{label}</text>
                          <line x1="20" y1="0" x2="310" y2={120 - cy} stroke="#5b8cff" strokeWidth="1.5" strokeDasharray="4,2" />
                        </g>
                      );
                    })}
                    {/* Central Node B */}
                    <g transform="translate(430, 120)">
                      <circle r="44" fill="#131824" stroke="#ff4d5e" strokeWidth="3.5" className="anim-pulse-ring" />
                      <circle r="24" fill="#ff4d5e" opacity="0.4" />
                      <text textAnchor="middle" y="6" fill="#fff" fontWeight="bold" fontSize="16">B</text>
                      <text textAnchor="middle" y="62" fill="#e7ecf3" fontSize="13" fontWeight="bold">Account B</text>
                      <text textAnchor="middle" y="78" fill="#ff4d5e" fontSize="11" fontWeight="bold">High Fan-In Target</text>
                    </g>
                  </svg>
                </div>
              </div>

              <div className="story-explanation-box">
                <p>• Account B is receiving money from many different distinct accounts in a short time window.</p>
                <p>• This structural money-flow pattern is defined as <strong>FAN-IN</strong>.</p>
                <p>• Fan-in measures how many unique senders funnel funds into a single account.</p>
                <p style={{ color: '#ffb347', fontWeight: 600 }}>• Note: Fan-in is a behavioral signal, not definitive proof of fraud on its own.</p>
              </div>

              <div className="story-takeaway">
                <span className="takeaway-label">KEY TAKEAWAY</span>
                <p>"High fan-in indicates an aggregation point, which can be normal for merchants but suspicious for personal accounts."</p>
              </div>
            </div>
          )}

          {/* STEP 03 */}
          {currentStep === 2 && (
            <div className="story-step-body animate-fade-in">
              <div className="story-vis-card">
                <div className="story-timeline-card">
                  <div className="timeline-step">
                    <span className="t-label">INFLOW</span>
                    <span className="t-val">₹4,800 Received</span>
                  </div>
                  <div className="timeline-arrow">↓</div>
                  <div className="timeline-step highlight">
                    <span className="t-label">HOLD DURATION</span>
                    <span className="t-val">7 Minutes Median Hold</span>
                  </div>
                  <div className="timeline-arrow">↓</div>
                  <div className="timeline-step">
                    <span className="t-label">OUTFLOW</span>
                    <span className="t-val">₹4,650 Forwarded</span>
                  </div>
                </div>

                <div className="story-vis-canvas">
                  <svg viewBox="0 0 550 200" className="story-svg">
                    <g transform="translate(100, 100)">
                      <circle r="28" fill="#6b7fd7" />
                      <text textAnchor="middle" y="5" fill="#fff" fontSize="12" fontWeight="bold">Senders</text>
                    </g>
                    <path d="M 132 100 L 235 100" stroke="#22c39a" strokeWidth="3" markerEnd="url(#arrow)" />
                    <g transform="translate(275, 100)">
                      <circle r="38" fill="#131824" stroke="#ff4d5e" strokeWidth="3" />
                      <text textAnchor="middle" y="-4" fill="#fff" fontWeight="bold" fontSize="14">B</text>
                      <text textAnchor="middle" y="16" fill="#ff4d5e" fontSize="10" fontWeight="bold">Pass-Through</text>
                    </g>
                    <path d="M 317 100 L 418 100" stroke="#ff4d5e" strokeWidth="3" />
                    <g transform="translate(450, 100)">
                      <circle r="28" fill="#b57bff" />
                      <text textAnchor="middle" y="5" fill="#fff" fontSize="12" fontWeight="bold">Receiver X</text>
                    </g>
                  </svg>
                </div>
              </div>

              <div className="story-explanation-box">
                <p>• TrustGraph also measures <strong>HOLD TIME</strong> — how long funds rest in an account before being moved.</p>
                <p>• A normal personal account usually retains received money for hours, days, or weeks.</p>
                <p>• Rapid pass-through movement (minutes) can become a strong risk indicator when combined with high fan-in.</p>
              </div>

              <div className="story-takeaway">
                <span className="takeaway-label">KEY TAKEAWAY</span>
                <p>"Mule accounts minimize hold time to avoid frozen funds. Speed matters when combined with other signals."</p>
              </div>
            </div>
          )}

          {/* STEP 04 */}
          {currentStep === 3 && (
            <div className="story-step-body animate-fade-in">
              <div className="story-signals-grid">
                {signalDetails.map((sig, idx) => (
                  <div
                    key={sig.key}
                    className={`story-signal-card ${activeSignal === idx ? 'selected' : ''}`}
                    onClick={() => setActiveSignal(idx)}
                  >
                    <div className="sig-card-header">
                      <span className="sig-card-name">{sig.name}</span>
                      <span className="sig-card-tag">{sig.tag}</span>
                    </div>
                    <p className="sig-card-desc">{sig.desc}</p>
                    <div className="sig-card-svg">{sig.svg}</div>
                  </div>
                ))}
              </div>

              <div className="story-explanation-box">
                <p>• TrustGraph measures <strong>six independent behavioral signals</strong> for every account in real time.</p>
                <p>• Each signal evaluates a distinct structural property of money flow (0.0 to 1.0 normalized).</p>
              </div>

              <div className="story-takeaway">
                <span className="takeaway-label">KEY TAKEAWAY</span>
                <p>"Multiple independent signals evaluate structure, velocity, volume, and profile consistency."</p>
              </div>
            </div>
          )}

          {/* STEP 05 */}
          {currentStep === 4 && (
            <div className="story-step-body animate-fade-in">
              <div className="story-vis-card">
                <div className="story-score-tally-container">
                  <div className="score-center-node">
                    <span className="node-id">ACC00217</span>
                    <span className="node-type">Personal Account</span>
                    <div className="score-big-display">
                      <span className="num">{scoreTally}</span>
                      <span className="max">/ 100</span>
                    </div>
                    <span className="score-sub-label">Illustrative scoring example</span>
                  </div>

                  <div className="score-breakdown-list">
                    <div className="score-row hot">
                      <span>Fan-in (+18)</span>
                      <span className="bar-val">18 / 19</span>
                    </div>
                    <div className="score-row hot">
                      <span>Hold (+14)</span>
                      <span className="bar-val">14 / 30</span>
                    </div>
                    <div className="score-row">
                      <span>Velocity (+9)</span>
                      <span className="bar-val">9 / 13</span>
                    </div>
                    <div className="score-row">
                      <span>Structuring (+7)</span>
                      <span className="bar-val">7 / 33</span>
                    </div>
                    <div className="score-row">
                      <span>Fan-out (+3)</span>
                      <span className="bar-val">3 / 3</span>
                    </div>
                    <div className="score-row">
                      <span>Mismatch (+2)</span>
                      <span className="bar-val">2 / 2</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="story-explanation-box">
                <p>• The final 0–100 risk score is calculated from the six weighted rule signals.</p>
                <p>• Every point on the score can be traced back to a plain-English explanation — completely transparent and deterministic.</p>
              </div>

              <div className="story-takeaway">
                <span className="takeaway-label">KEY TAKEAWAY</span>
                <p>"No single signal dominates. Risk accumulates as multiple behavioral rules fire together."</p>
              </div>
            </div>
          )}

          {/* STEP 06 */}
          {currentStep === 5 && (
            <div className="story-step-body animate-fade-in">
              <div className="story-vis-card">
                <div className="threshold-demo-wrap">
                  <div className="threshold-gauge">
                    <div className="t-metric">
                      <span className="k">LIVE RISK SCORE</span>
                      <span className="v danger">53 / 100</span>
                    </div>
                    <div className="t-vs">≥</div>
                    <div className="t-metric">
                      <span className="k">RISK THRESHOLD</span>
                      <span className="v">50</span>
                    </div>
                    <div className="t-status-pill danger">53 ≥ 50 → FLAGGED</div>
                  </div>

                  <div className="node-transition-preview">
                    <div className="transition-node normal">
                      <span className="dot">●</span>
                      <span>NORMAL (BLUE)</span>
                    </div>
                    <span className="arrow">→</span>
                    <div className="transition-node rising">
                      <span>SCORE RISES (53)</span>
                    </div>
                    <span className="arrow">→</span>
                    <div className="transition-node flagged">
                      <span className="dot">●</span>
                      <span>FLAGGED (RED)</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="story-explanation-box">
                <p>• The threshold (default 50) is the score at which TrustGraph flags an account for investigation.</p>
                <p>• Crossing the threshold does not mean the account is automatically proven fraudulent.</p>
                <p style={{ color: '#ff4d5e', fontWeight: 700 }}>• Key Rule: Flagged ≠ proven fraud.</p>
              </div>

              <div className="story-takeaway">
                <span className="takeaway-label">KEY TAKEAWAY</span>
                <p>"Crossing threshold 50 triggers automated rule alerts for investigation."</p>
              </div>
            </div>
          )}

          {/* STEP 07 */}
          {currentStep === 6 && (
            <div className="story-step-body animate-fade-in">
              <div className="story-vis-card">
                <div className="network-growth-banner">
                  <span className="badge">NETWORK DISCOVERED</span>
                  <span className="info">{networkCount} Flagged Accounts Connected in Mule Ring</span>
                </div>

                <div className="story-vis-canvas">
                  <svg viewBox="0 0 550 200" className="story-svg">
                    <g transform="translate(120, 100)">
                      <circle r="26" fill="#ff4d5e" />
                      <text textAnchor="middle" y="4" fill="#fff" fontWeight="bold" fontSize="12">Collector B</text>
                    </g>
                    <line x1="146" y1="90" x2="254" y2="50" stroke="#ff4d5e" strokeWidth="2" />
                    <line x1="146" y1="110" x2="254" y2="150" stroke="#ff4d5e" strokeWidth="2" />
                    <g transform="translate(280, 45)">
                      <circle r="24" fill="#ff4d5e" />
                      <text textAnchor="middle" y="4" fill="#fff" fontWeight="bold" fontSize="11">Mule C</text>
                    </g>
                    <g transform="translate(280, 155)">
                      <circle r="24" fill="#ff4d5e" />
                      <text textAnchor="middle" y="4" fill="#fff" fontWeight="bold" fontSize="11">Mule D</text>
                    </g>
                    <line x1="304" y1="50" x2="414" y2="90" stroke="#ff4d5e" strokeWidth="2" />
                    <line x1="304" y1="150" x2="414" y2="110" stroke="#ff4d5e" strokeWidth="2" />
                    <g transform="translate(440, 100)">
                      <circle r="26" fill="#ff4d5e" />
                      <text textAnchor="middle" y="4" fill="#fff" fontWeight="bold" fontSize="11">Cashout E</text>
                    </g>
                  </svg>
                </div>
              </div>

              <div className="story-explanation-box">
                <p>• One flagged account alone is not necessarily a full scam network.</p>
                <p>• When multiple flagged accounts become connected through transactions, TrustGraph identifies a <strong>suspicious network</strong>.</p>
              </div>

              <div className="story-takeaway">
                <span className="takeaway-label">KEY TAKEAWAY</span>
                <p>"Individual flagged accounts reveal suspicious behavior. Connected subgraphs reveal the entire mule ring."</p>
              </div>
            </div>
          )}

          {/* STEP 08 */}
          {currentStep === 7 && (
            <div className="story-step-body animate-fade-in">
              <div className="story-vis-card">
                <div className={`fp-demo-card ${isRevealedFP ? 'revealed' : ''}`}>
                  <div className="fp-card-header">
                    <span className="acct">ACC00215</span>
                    <span className="type">Personal Account · High Activity</span>
                  </div>

                  <div className="fp-metrics-row">
                    <div className="m">
                      <span className="k">RISK SCORE</span>
                      <span className="v">63.2 / 100</span>
                    </div>
                    <div className="m">
                      <span className="k">THRESHOLD</span>
                      <span className="v">50</span>
                    </div>
                    <div className="m">
                      <span className="k">RULE RESULT</span>
                      <span className="v warning">63.2 ≥ 50 FLAGGED</span>
                    </div>
                  </div>

                  {isRevealedFP && (
                    <div className="fp-truth-banner animate-pop">
                      <div className="fp-truth-title">GROUND TRUTH METADATA</div>
                      <div className="fp-truth-badge">GROUND TRUTH: LEGITIMATE ACCOUNT</div>
                      <div className="fp-truth-tag">FALSE POSITIVE (AMBER NODE)</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="story-explanation-box">
                <p>• A <strong>false positive</strong> occurs when rule thresholds flag a legitimate high-volume account.</p>
                <p>• In our benchmark evaluation, ground truth metadata allows measuring exact precision and false positives.</p>
                <p style={{ color: '#ffb347', fontWeight: 600 }}>• False positives are styled AMBER in the graph so they are easily distinguished from confirmed mule rings.</p>
              </div>

              <div className="story-takeaway">
                <span className="takeaway-label">KEY TAKEAWAY</span>
                <p>"High-activity legitimate accounts can cross risk thresholds. Evaluating false positives ensures system precision."</p>
              </div>
            </div>
          )}

          {/* Controls Footer */}
          <div className="story-step-footer">
            <button
              className="story-btn prev"
              onClick={handlePrev}
              disabled={currentStep === 0}
            >
              ← Previous
            </button>
            <span className="story-step-counter">
              Step {currentStep + 1} of {steps.length}
            </span>
            {currentStep < steps.length - 1 ? (
              <button className="story-btn next" onClick={handleNext}>
                Next Step →
              </button>
            ) : (
              <button className="story-btn cta" onClick={onReturnToLive}>
                ▶ Watch Live Detection
              </button>
            )}
          </div>
        </main>
      </div>

      {/* Ready Banner Section at Bottom of Step 08 */}
      {currentStep === 7 && (
        <section className="story-ready-banner animate-fade-in">
          <div className="ready-content">
            <h2>YOU'RE READY</h2>
            <p>Now watch TrustGraph build the transaction graph one transaction at a time.</p>
            <div className="ready-checklist">
              <div className="ready-item">① Suspicious accounts turning RED</div>
              <div className="ready-item">② Risk scores crossing the threshold</div>
              <div className="ready-item">③ Suspicious connections appearing</div>
              <div className="ready-item">④ Networks being discovered and expanded</div>
              <div className="ready-item">⑤ Legitimate accounts producing FALSE POSITIVES</div>
            </div>
            <div className="ready-actions">
              <button className="ready-btn-primary" onClick={onReturnToLive}>
                ▶ WATCH LIVE DETECTION
              </button>
              <button className="ready-btn-secondary" onClick={() => setCurrentStep(0)}>
                ← Restart Story
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
