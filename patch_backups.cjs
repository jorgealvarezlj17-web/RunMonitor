const fs = require('fs');
let code = fs.readFileSync('src/components/Settings.tsx', 'utf8');

// Replace the stagedBackup block
const stagedRegex = /\{\/\* Live Pre-generated Staged Report Card \*\/\}.*?(?=\{\/\* Search & Filter Bar \*\/\})/s;

const newStaged = `{/* Live Pre-generated Staged Report Card */}
              {stagedBackup && (
                <div className="relative p-5 bg-sky-50/60 rounded-2xl border border-sky-200/60 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-sky-200/60 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                         <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-500 text-white shadow-sm">
                           <Clock size={12} /> Borrador en Vivo
                         </span>
                         <h4 className="text-sm font-bold text-slate-800">
                           Próximo Reporte Automático
                         </h4>
                      </div>
                      <p className="text-xs text-slate-500 mt-1.5 font-medium">
                         Se enviará a las {config.shiftEndTime || '18:00'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyBackup(stagedBackup)}
                        className="h-8 px-3 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs transition-colors shadow-sm border border-sky-200/60 flex items-center gap-1.5"
                      >
                        {copiedId === stagedBackup.id ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                        <span>Copiar</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSendStagedNow}
                        disabled={resendingId === 'staged_upcoming_report'}
                        className="h-8 px-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium text-xs transition-colors shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {resendingId === 'staged_upcoming_report' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        <span>Enviar Ya</span>
                      </button>
                    </div>
                  </div>

                  {/* Note message preview */}
                  <div className="text-slate-700 text-[13px] whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto custom-scrollbar select-text bg-white/50 p-4 rounded-xl border border-slate-100 font-sans shadow-sm">
                    {stagedBackup.message}
                  </div>

                  {resendStatus && resendStatus.id === 'staged_upcoming_report' && (
                    <div className={\`p-2 rounded-lg text-xs font-medium flex items-center gap-1.5 \${
                      resendStatus.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }\`}>
                      {resendStatus.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                      <span>{resendStatus.message}</span>
                    </div>
                  )}
                </div>
              )}

              `;
code = code.replace(stagedRegex, newStaged);

const backupMapRegex = /<div\s+key=\{bk\.id\}\s+className="p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-colors space-y-2"\s*>.*?<\/div>\s+\);\s+\}\)\}/s;

const newBackupMap = `<div
                          key={bk.id}
                          className="group relative p-4 bg-yellow-50/60 rounded-xl border border-yellow-200/50 shadow-sm transition-all hover:shadow-md space-y-3"
                        >
                          {/* Header of the note */}
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-yellow-200/50 pb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <FileText size={14} className="text-yellow-600" />
                                <h4 className="text-sm font-bold text-slate-800">
                                  {isManual ? 'Reporte Manual' : 'Corte de Turno'}
                                </h4>
                                {isSuccess && (
                                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-100/50 px-1.5 py-0.5 rounded">
                                    <CheckCircle2 size={10} /> Enviado
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-1 font-medium">
                                {formattedDate} • {bk.recipient}
                              </p>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-1.5 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => handleCopyBackup(bk)}
                                className="p-1.5 rounded-lg bg-white/60 hover:bg-white text-slate-600 hover:text-slate-900 transition-colors shadow-sm border border-yellow-200/50"
                                title="Copiar reporte al portapapeles"
                              >
                                {copiedId === bk.id ? (
                                  <Check size={14} className="text-emerald-600" />
                                ) : (
                                  <Copy size={14} />
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleResendBackup(bk)}
                                disabled={resendingId === bk.id}
                                className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm disabled:opacity-50"
                                title="Reenviar a WhatsApp"
                              >
                                {resendingId === bk.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <Send size={14} />
                                )}
                              </button>

                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSingleBackup(bk.id)}
                                  className="p-1.5 rounded-lg bg-white/60 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors shadow-sm border border-yellow-200/50"
                                  title="Eliminar registro"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Error notice if present */}
                          {bk.error && (
                            <div className="px-3 py-2 rounded-lg bg-rose-50/80 border border-rose-200/50 text-rose-700 text-xs font-medium flex items-center gap-1.5">
                              <AlertCircle size={14} className="shrink-0 text-rose-600" />
                              <span>{bk.error}</span>
                            </div>
                          )}

                          {/* Note message preview */}
                          <div className="text-slate-700 text-[13px] whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto custom-scrollbar select-text bg-white/50 p-4 rounded-xl shadow-sm border border-slate-100 font-sans">
                            {bk.message}
                          </div>

                          {/* Resend status */}
                          {resendStatus && resendStatus.id === bk.id && (
                            <div className={\`p-2 rounded-lg text-[11px] font-medium flex items-center gap-1.5 \${
                              resendStatus.success ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
                            }\`}>
                              {resendStatus.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                              <span>{resendStatus.message}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}`;

code = code.replace(backupMapRegex, newBackupMap);

fs.writeFileSync('src/components/Settings.tsx', code);
