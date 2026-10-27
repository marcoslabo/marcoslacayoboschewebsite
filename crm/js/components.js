// ==========================================================================
// CRM UI Components
// ==========================================================================

const CRMComponents = {

    // ==========================================================================
    // Dashboard
    // ==========================================================================

    esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    },

    /**
     * List filter (the side comes from the Nymbl | Personal switch in the header)
     */
    renderListFilter(scope = {}, lists = []) {
        const shown = lists.filter(l => l.side === scope.side);
        return `
            <select class="filter-select" onchange="window.crmApp.setScope({ list: this.value })">
                <option value="">All ${window.CRM_CONFIG.SIDES[scope.side]} lists</option>
                ${shown.map(l => `
                    <option value="${this.esc(l.name)}" ${scope.list === l.name ? 'selected' : ''}>${this.esc(l.name)}</option>
                `).join('')}
            </select>
        `;
    },

    // ==========================================================================
    // Today: one list, top to bottom
    // ==========================================================================

    renderToday({ scope, lists, replies, followUps, queue, sentToday, newSentToday, newTarget }) {
        const sideLabel = window.CRM_CONFIG.SIDES[scope.side];
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

        return `
            <div class="page-header today-header">
                <div>
                    <h1 class="page-title">Today · ${sideLabel}</h1>
                    <p class="page-subtitle">${today}</p>
                </div>
                ${this.renderListFilter(scope, lists)}
            </div>

            <div class="today-stats">
                <div><strong>${newSentToday}</strong> / <button class="target-edit" title="Change your daily target"
                    onclick="window.crmApp.editTarget()">${newTarget}</button> new people today
                    <span class="today-split">Nymbl + Personal together</span></div>
                <div><strong>${followUps.length}</strong> follow-up${followUps.length === 1 ? '' : 's'} due</div>
                <div class="${replies.length ? 'is-hot' : ''}"><strong>${replies.length}</strong> ${replies.length === 1 ? 'reply' : 'replies'} waiting</div>
                <div><strong>${sentToday}</strong> message${sentToday === 1 ? '' : 's'} sent today</div>
            </div>

            ${this.renderTodaySection('① Replied: answer these first', 'They answered you, or finished the Grader.', replies, 'reply')}
            ${this.renderTodaySection('② Follow-ups due', 'The sequence scheduled these. Send the next message.', followUps, 'follow')}
            ${this.renderTodaySection('③ New people', queue.total
                ? `To contact, priority A first. ${queue.ready.length ? '' : 'You hit today\'s target 🎉'}`
                : 'Nobody waiting. Import a list with ⋯ → Import.', queue.ready, 'new')}

            ${queue.waiting.length ? `
                <details class="card today-waiting">
                    <summary>${queue.waiting.length} waiting (same company as someone you messaged)</summary>
                    ${queue.waiting.map(c => `
                        <div class="outreach-waiting">
                            <a href="#/contact/${c.id}">${this.esc(c.first_name)} ${this.esc(c.last_name)}</a>
                            <span>${this.esc(c.companies?.name || '')}</span>
                            <span class="badge badge-notafit">${c.waitReason}</span>
                        </div>
                    `).join('')}
                </details>
            ` : ''}
        `;
    },

    renderTodaySection(title, hint, people, kind) {
        return `
            <section class="today-section">
                <div class="today-section-head">
                    <h2>${title} <span class="card-count">${people.length}</span></h2>
                    <p>${hint}</p>
                </div>
                ${people.map(c => this.renderPersonCard(c, kind)).join('')}
            </section>
        `;
    },

    /**
     * One person, everything you need, one row of buttons
     */
    renderPersonCard(c, kind) {
        const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'No name';
        const notes = c.notes || c.intent_reason || c.problem || '';
        const step = window.crmDB.nextStep(c);
        const stepLabel = kind === 'reply' ? 'Reply'
            : `Message ${step} of ${window.CRM_CONFIG.CADENCE.length} · ${window.CRM_CONFIG.CADENCE[step - 1].label}`;

        return `
            <div class="card person-card" id="person-${c.id}">
                <div class="person-head">
                    <div>
                        <div class="person-name">
                            ${c.priority ? `<span class="priority priority-${c.priority}">${c.priority}</span>` : ''}
                            <a href="#/contact/${c.id}">${this.esc(name)}</a>
                            ${c.graded_at ? '<span class="badge badge-graded" title="Finished the Workflow Grader">🩺 Graded</span>' : ''}
                        </div>
                        <div class="person-meta">${this.esc([c.job_title, c.companies?.name, c.list].filter(Boolean).join(' · '))}</div>
                    </div>
                    <span class="person-step">${stepLabel}</span>
                </div>
                ${notes ? `<p class="person-notes">${this.esc(notes)}</p>` : ''}
                <div class="person-draft" id="draft-${c.id}" hidden>
                    <textarea rows="5" id="draftText-${c.id}"></textarea>
                </div>
                <div class="person-actions">
                    ${c.linkedin_url ? `<a class="btn btn-sm btn-secondary" href="${this.esc(c.linkedin_url)}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>` : ''}
                    ${c.email ? `<a class="btn btn-sm btn-secondary" href="mailto:${this.esc(c.email)}">Email ↗</a>` : ''}
                    <button class="btn btn-sm btn-secondary" onclick="window.crmApp.draft('${c.id}')">✍️ Draft</button>
                    <button class="btn btn-sm btn-secondary" onclick="window.crmApp.copyDraft('${c.id}', this)">Copy</button>
                    <span class="person-actions-gap"></span>
                    ${this.renderActionButtons(c, kind)}
                </div>
                <p class="person-status" id="status-${c.id}"></p>
            </div>
        `;
    },

    /**
     * The only buttons you need. Each one sets the stage and the next step.
     */
    renderActionButtons(c, kind) {
        const btn = (action, label, cls = 'btn-secondary') =>
            `<button class="btn btn-sm ${cls}" onclick="window.crmApp.act('${c.id}', '${action}')">${label}</button>`;

        if (kind === 'reply' || c.status === 'Replied') {
            return btn('answered', '✓ Answered', 'btn-primary') + btn('booked', '📅 Call booked') + btn('notInterested', '✕ Not interested');
        }
        if (c.status === 'Call booked' || c.status === 'Demo') {
            return btn('advance', `→ ${window.crmDB.nextStage(c.status)}`, 'btn-primary') + btn('snooze', 'Later');
        }
        return btn('sent', '✓ Sent', 'btn-primary') + btn('replied', '💬 They replied') + btn('notInterested', '✕ Not interested');
    },

    // ==========================================================================
    // Pipeline: where people are, and this week's funnel
    // ==========================================================================

    renderPipeline({ scope, lists, contacts, funnel, sources }) {
        const columns = window.CRM_CONFIG.PIPELINE;
        const byStage = Object.fromEntries(columns.map(s => [s, contacts.filter(c => c.status === s)]));
        // Drag a card onto a column (or onto Nurture / Not a Fit) to move it
        const drop = stage => `data-stage="${stage}"
            ondragover="event.preventDefault(); this.classList.add('is-over')"
            ondragleave="this.classList.remove('is-over')"
            ondrop="window.crmApp.dropOnStage(event, this)"`;

        return `
            <div class="page-header today-header">
                <div>
                    <h1 class="page-title">Pipeline · ${window.CRM_CONFIG.SIDES[scope.side]}</h1>
                    <p class="page-subtitle">Drag a person to another column to move them.</p>
                </div>
                ${this.renderListFilter(scope, lists)}
            </div>

            <div class="board">
                ${columns.map(stage => `
                    <div class="board-col" ${drop(stage)}>
                        <div class="board-col-head">${stage} <span class="card-count">${byStage[stage].length}</span></div>
                        ${byStage[stage].slice(0, 30).map(c => `
                            <a class="board-card" href="#/contact/${c.id}" draggable="true"
                                ondragstart="event.dataTransfer.setData('text/plain', '${c.id}')">
                                <strong>${this.esc(`${c.first_name || ''} ${c.last_name || ''}`.trim())}</strong>
                                ${c.graded_at ? ' 🩺' : ''}
                                <span>${this.esc(c.companies?.name || '')}</span>
                            </a>
                        `).join('')}
                        ${byStage[stage].length > 30 ? `<a class="board-more" href="#/contacts" onclick="window.crmApp.handleStatusFilter('${stage}')">+ ${byStage[stage].length - 30} more</a>` : ''}
                    </div>
                `).join('')}
            </div>
            <div class="board-side">
                <div class="board-drop" ${drop('Nurture')}>↓ Drop here: <strong>Nurture</strong> (not now)</div>
                <div class="board-drop" ${drop('Not a Fit')}>↓ Drop here: <strong>Not a Fit</strong></div>
            </div>

            ${this.renderFunnel(funnel)}

            ${this.renderSources(sources)}
        `;
    },

    /**
     * This week's funnel, with the % conversion into each step.
     * The lowest conversion is the constraint.
     */
    renderFunnel(funnel) {
        const shown = [
            ['Messaged', 'Messaged'],
            ['Replied', 'Replied'],
            ['Call booked', 'Calls booked'],
            ['Demo', 'Demos'],
            ['Won', 'Won']
        ];
        const counts = Object.fromEntries((funnel || []).map(f => [f.stage, f.count]));
        const steps = shown.map(([stage, label], i) => {
            const count = counts[stage] || 0;
            const prev = i > 0 ? counts[shown[i - 1][0]] || 0 : null;
            const rate = prev ? Math.round((count / prev) * 100) : null;
            return { label, count, rate };
        });

        const rated = steps.filter(s => s.rate !== null);
        const constraint = rated.length ? rated.reduce((min, s) => (s.rate < min.rate ? s : min)) : null;

        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">This week</h3>
                </div>
                <div class="funnel">
                    ${steps.map(s => `
                        <div class="funnel-step ${s === constraint ? 'is-constraint' : ''}">
                            <div class="stat-number">${s.count}</div>
                            <div class="stat-label">${s.label}</div>
                            ${s.rate !== null
                                ? `<span class="funnel-rate ${s === constraint ? 'is-constraint' : ''}">${s.rate}% from previous</span>`
                                : '<span class="funnel-rate">&nbsp;</span>'}
                        </div>
                    `).join('')}
                </div>
                ${constraint
                    ? `<p class="funnel-note">Your constraint: <strong>${constraint.label}</strong> (${constraint.rate}% from the step before).</p>`
                    : '<p class="funnel-note">Conversion shows once this week has activity.</p>'}
            </div>
        `;
    },

    renderSources(sources) {
        const max = Math.max(1, ...(sources || []).map(([, n]) => n));
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">New leads by source <span class="card-count">this week</span></h3>
                </div>
                ${(sources || []).length ? sources.map(([source, n]) => `
                    <div class="source-row">
                        <span>${source}</span>
                        <div class="source-bar"><span style="width:${Math.round((n / max) * 100)}%"></span></div>
                        <strong>${n}</strong>
                    </div>
                `).join('') : '<p style="color: var(--color-text-muted); font-size: 14px;">No new leads yet this week.</p>'}
            </div>
        `;
    },

    // ==========================================================================
    // Contacts List
    // ==========================================================================

    renderContactsList(contacts, filters = {}, lists = []) {
        return `
            <div class="page-header">
                <h1 class="page-title">Contacts · ${window.CRM_CONFIG.SIDES[filters.side] || ''}</h1>
                <p class="page-subtitle">${contacts.length} contact${contacts.length !== 1 ? 's' : ''}. Switch Nymbl / Personal at the top. To change someone's list, open them.</p>
            </div>

            <div class="filters">
                ${this.renderListFilter(filters, lists)}

                <input type="text" class="search-input" placeholder="Search name or email..." 
                    value="${filters.search || ''}" 
                    onkeyup="window.crmApp.handleSearch(event)">
                <select class="filter-select" onchange="window.crmApp.handleSourceFilter(this.value)">
                    <option value="">All Sources</option>
                    ${window.CRM_CONFIG.SOURCES.map(s => `
                        <option value="${s}" ${filters.source === s ? 'selected' : ''}>${s}</option>
                    `).join('')}
                </select>
                <select class="filter-select" onchange="window.crmApp.handleStatusFilter(this.value)">
                    <option value="">All Stages</option>
                    ${window.CRM_CONFIG.STATUSES.map(s => `
                        <option value="${s}" ${filters.status === s ? 'selected' : ''}>${s}</option>
                    `).join('')}
                </select>
            </div>

            <div class="card">
                ${contacts.length ? `
                    <table class="contacts-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Company</th>
                                <th>Source</th>
                                <th>Stage</th>
                                <th>Next Action</th>
                                <th>Added</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${contacts.map(c => this.renderContactRow(c)).join('')}
                        </tbody>
                    </table>
                ` : `
                    <div class="empty-state">
                        <div class="empty-state-icon">👤</div>
                        <h3 class="empty-state-title">No contacts found</h3>
                        <p>Add your first contact!</p>
                    </div>
                `}
            </div>
        `;
    },

    renderContactRow(contact) {
        const companyName = contact.companies?.name || '';
        const added = new Date(contact.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const nextAction = contact.next_action && contact.next_action !== 'None'
            ? `${contact.next_action}${contact.next_action_date ? ' - ' + new Date(contact.next_action_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}`
            : '—';

        return `
            <tr onclick="window.crmApp.goToContact('${contact.id}')">
                <td class="contact-name">${contact.high_intent ? '<span title="High Intent" style="margin-right:4px;">🔥</span>' : ''}${contact.first_name} ${contact.last_name}${contact.brevo_synced ? ' <span style="color: #059669; font-size: 11px;" title="In Brevo">✓ Brevo</span>' : ''}${contact.list ? ` <span style="background: #f5f3ff; color: #7c3aed; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 500;">${this.esc(contact.list)}</span>` : ''}</td>
                <td>${companyName}</td>
                <td>${this.renderSourceBadge(contact.source)}</td>
                <td>${this.renderStatusBadge(contact.status)}</td>
                <td>${nextAction}</td>
                <td style="color: var(--color-text-muted)">${added}</td>
            </tr>
        `;
    },

    // ==========================================================================
    // Contact Detail
    // ==========================================================================

    renderContactDetail(contact) {
        const companyName = contact.companies?.name || '';

        return `
            <div class="contact-detail">
                <a href="#/contacts" class="btn btn-ghost btn-sm" style="margin-bottom: 16px;">← Back to Contacts</a>
                
                <div class="card">
                    <div class="contact-detail-header">
                        <div>
                            <h1 class="contact-detail-name">${contact.first_name} ${contact.last_name}</h1>
                            ${contact.job_title ? `<p class="contact-detail-title">${contact.job_title}</p>` : ''}
                        </div>
                        <div style="display:flex; gap:8px; align-items:center;">
                            <button
                                id="highIntentBtn"
                                onclick="window.crmApp.toggleHighIntent('${contact.id}', ${!contact.high_intent})"
                                title="${contact.high_intent ? 'Remove from High Intent' : 'Mark as High Intent'}"
                                style="
                                    background: ${contact.high_intent ? '#fff7ed' : 'white'};
                                    border: 1.5px solid ${contact.high_intent ? '#f97316' : '#e2e8f0'};
                                    border-radius: 8px; padding: 6px 12px;
                                    font-size: 14px; cursor: pointer;
                                    transition: all 0.15s;
                                    color: ${contact.high_intent ? '#ea580c' : '#94a3b8'};
                                    font-weight: 600;
                                "
                            >${contact.high_intent ? '🔥 High Intent' : '☆ Mark Priority'}</button>
                            <button class="btn btn-secondary btn-sm" onclick="window.crmApp.editContact('${contact.id}')">Edit</button>
                        </div>
                    </div>

                    <!-- Contact Info Grid -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin: 20px 0; padding: 16px; background: #f8fafc; border-radius: 8px;">
                        ${companyName ? `
                            <div>
                                <span style="font-size: 12px; color: #64748b; display: block;">Company</span>
                                <strong style="font-size: 15px;">${companyName}</strong>
                            </div>
                        ` : ''}
                        ${contact.email ? `
                            <div>
                                <span style="font-size: 12px; color: #64748b; display: block;">Email</span>
                                <a href="mailto:${contact.email}" style="font-size: 15px;">${contact.email}</a>
                            </div>
                        ` : ''}
                        ${contact.phone ? `
                            <div>
                                <span style="font-size: 12px; color: #64748b; display: block;">Phone</span>
                                <a href="tel:${contact.phone}" style="font-size: 15px;">${contact.phone}</a>
                            </div>
                        ` : ''}
                        ${contact.linkedin_url ? `
                            <div>
                                <span style="font-size: 12px; color: #64748b; display: block;">LinkedIn</span>
                                <a href="${contact.linkedin_url}" target="_blank" style="font-size: 15px;">View Profile ↗</a>
                            </div>
                        ` : ''}
                    </div>

                    <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                        ${this.renderSourceBadge(contact.source)}
                        ${this.renderStatusBadge(contact.status)}
                        ${contact.brevo_synced
                ? `<span class="badge" style="background: #d1fae5; color: #047857;">✓ In Brevo (${contact.brevo_tag || 'synced'})</span>`
                : (window.crmAuth?.isAdmin()
                    ? (contact.email
                        ? `<div style="display: flex; gap: 8px; align-items: center;">
                            <select id="brevoListSelect" class="filter-select" style="font-size: 13px; padding: 4px 8px;">
                                <option value="19">🏥 HIMSS 26</option>
                                <option value="15">Met in Person</option>
                                <option value="16">Direct Call</option>
                                <option value="17">LinkedIn</option>
                                <option value="18">Referral</option>
                                <option value="14">Spark Lead</option>
                            </select>
                            <button class="btn btn-sm btn-secondary" onclick="window.crmApp.pushToBrevo('${contact.id}')">Push to Brevo →</button>
                        </div>`
                        : `<span style="font-size: 12px; color: #94a3b8; font-style: italic;">Add email to sync to Brevo</span>`)
                    : '')
            }
                    </div>
                </div>

                ${contact.problem ? `
                    <div class="card">
                        <div class="contact-section">
                            <h4 class="contact-section-title">Problem</h4>
                            <p class="contact-problem">"${contact.problem}"</p>
                        </div>
                    </div>
                ` : ''}

                ${contact.intent_reason ? `
                    <div class="card">
                        <div class="contact-section">
                            <h4 class="contact-section-title">🎯 Intent Reason</h4>
                            <p style="margin-bottom: 12px; line-height: 1.6;">${contact.intent_reason}</p>
                            ${contact.source_links ? `
                                <div style="margin-top: 12px;">
                                    <span style="font-size: 12px; color: var(--color-text-muted); display: block; margin-bottom: 8px;">Sources:</span>
                                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                        ${contact.source_links.split(',').map((link, i) => {
                const url = link.trim();
                if (!url) return '';
                const domain = url.replace(/https?:\/\//, '').split('/')[0];
                return `<a href="${url}" target="_blank" class="badge" style="text-decoration: none; background: #f0f9ff; color: #0284c7;">${domain} ↗</a>`;
            }).join('')}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                ` : ''}

                <div class="card">
                    <div class="contact-section">
                        <h4 class="contact-section-title">Stage</h4>
                        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                            ${this.renderStatusBadge(contact.status)}
                            ${contact.graded_at ? '<span class="badge badge-graded">🩺 Graded</span>' : ''}
                            ${contact.status === 'Won' || contact.status === 'Not a Fit' ? '' : this.renderActionButtons(contact, contact.status === 'Replied' ? 'reply' : '')}
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 12px; font-size: 13px; color: var(--color-text-muted);">
                            Stage
                            <select class="filter-select" onchange="window.crmApp.setStage('${contact.id}', this.value)">
                                ${window.CRM_CONFIG.STATUSES.map(st => `<option value="${st}" ${contact.status === st ? 'selected' : ''}>${st}</option>`).join('')}
                            </select>
                            List
                            <select class="filter-select" onchange="window.crmApp.moveToList(['${contact.id}'], this.value)">
                                <option value="">No list (Nymbl)</option>
                                ${(window.crmApp?.lists || []).map(l => `<option value="${this.esc(l.name)}" ${contact.list === l.name ? 'selected' : ''}>${this.esc(l.name)}</option>`).join('')}
                            </select>
                        </div>
                        ${contact.utm_source || contact.utm_campaign ? `<p style="margin-top: 10px; font-size: 12px; color: var(--color-text-muted);">Came from: ${[contact.utm_source, contact.utm_campaign].filter(Boolean).join(' · ')}</p>` : ''}
                    </div>
                </div>

                <div class="card">
                    <div class="contact-section">
                        <h4 class="contact-section-title">Next Action</h4>
                        <div style="display: flex; gap: 12px; align-items: center;">
                            <select id="nextActionSelect" class="filter-select" style="flex: 1;">
                                <option value="">No action</option>
                                ${window.CRM_CONFIG.NEXT_ACTIONS.filter(a => a !== 'None').map(a => `
                                    <option value="${a}" ${contact.next_action === a ? 'selected' : ''}>${a}</option>
                                `).join('')}
                            </select>
                            <input type="date" id="nextActionDate" class="filter-select" 
                                value="${contact.next_action_date || ''}" style="flex: 1;">
                            <button class="btn btn-primary btn-sm" onclick="window.crmApp.updateNextAction('${contact.id}')">Update</button>
                            <button class="btn btn-success btn-sm" onclick="window.crmApp.openLogOutcome('${contact.id}', '${contact.first_name} ${contact.last_name}', '${contact.next_action || 'meeting'}')">Log Activity</button>
                        </div>
                    </div>
                </div>

                <!-- Activity Timeline -->
                <div class="card">
                    <div class="contact-section">
                        <h4 class="contact-section-title">📅 Activity Timeline</h4>
                        <div id="activityTimeline" style="margin-top: 16px;">
                            <p style="color: var(--color-text-muted); font-style: italic;">Loading activities...</p>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="contact-section">
                        <h4 class="contact-section-title">Notes</h4>
                        <div id="voiceNotesContainer"></div>
                        ${this.renderNotes(contact.notes)}
                        <form onsubmit="window.crmApp.addNote(event, '${contact.id}')" style="margin-top: 16px;">
                            <div class="form-group" style="margin-bottom: 12px;">
                                <textarea name="note" rows="2" placeholder="Add a note..."></textarea>
                            </div>
                            <button type="submit" class="btn btn-secondary btn-sm">+ Add Note</button>
                        </form>
                    </div>
                </div>
            </div>
        `;
    },

    renderNotes(notes) {
        if (!notes) {
            return '<p style="color: var(--color-text-muted); font-style: italic;">No notes yet.</p>';
        }

        // Split notes by double newline (each note entry)
        const entries = notes.split('\n\n').filter(n => n.trim());

        return `
            <div class="contact-notes">
                ${entries.map(entry => {
            const [datePart, ...rest] = entry.split(': ');
            const noteText = rest.join(': ');
            return `
                        <div class="note-entry">
                            <div class="note-date">${datePart}</div>
                            <div>${noteText}</div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    },

    // ==========================================================================
    // Badges
    // ==========================================================================

    renderSourceBadge(source) {
        if (!source) return '';
        const classes = {
            'Grader': 'badge-spark',
            'LinkedIn post': 'badge-met',
            'LinkedIn outreach': 'badge-met',
            'Newsletter': 'badge-clay'
        };
        return `<span class="badge ${classes[source] || ''}">${source}</span>`;
    },

    renderSourceBadgeInline(source) {
        return source || '';
    },

    renderStatusBadge(status) {
        if (!status) return '';
        const stageIndex = window.CRM_CONFIG.PIPELINE.indexOf(status);
        const cls = stageIndex >= 0
            ? `badge-stage-${stageIndex}`
            : { 'Nurture': 'badge-nurture', 'Not a Fit': 'badge-notafit' }[status] || '';
        return `<span class="badge ${cls}">${status}</span>`;
    },

    // ==========================================================================
    // Settings: lists and their message templates
    // ==========================================================================

    renderSettings(lists) {
        const sideOptions = selected => Object.entries(window.CRM_CONFIG.SIDES)
            .map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');

        const listForm = (l, i) => `
            <form class="card settings-list" data-original="${this.esc(l?.name || '')}" onsubmit="event.preventDefault(); window.crmApp.saveList(this)">
                <div class="settings-row">
                    <input name="name" value="${this.esc(l?.name || '')}" placeholder="List name, e.g. Personal – New tool" required>
                    <select name="side">${sideOptions(l?.side || 'personal')}</select>
                    <input name="sort" type="number" value="${l?.sort ?? 100}" title="Order" style="width: 80px;">
                </div>
                <label class="settings-label">Message template (used by ✍️ Draft message)</label>
                <textarea name="template" rows="7" placeholder="Tone, length, the pain, the proof, the offer, the closing question…">${this.esc(l?.template || '')}</textarea>
                <div class="settings-row">
                    <button type="submit" class="btn btn-sm btn-primary">${l ? 'Save' : '+ Add list'}</button>
                    ${l ? `<button type="button" class="btn btn-sm btn-ghost" onclick="window.crmApp.deleteList(this.closest('form').dataset.original)">Delete</button>` : ''}
                    <span class="outreach-status"></span>
                </div>
            </form>
        `;

        return `
            <div class="page-header">
                <h1 class="page-title">Lists &amp; templates</h1>
                <p class="page-subtitle">Lists and their message templates. Renaming a list keeps its contacts; deleting one keeps the contacts and clears their list.</p>
            </div>
            ${lists.map(listForm).join('')}
            <h3 style="margin: 24px 0 12px;">New list</h3>
            ${listForm(null)}
        `;
    },

    // ==========================================================================
    // Loading & Error States
    // ==========================================================================

    renderLoading() {
        return '<div class="loading">Loading</div>';
    },

    renderError(message) {
        return `
            <div class="empty-state">
                <div class="empty-state-icon">❌</div>
                <h3 class="empty-state-title">Error</h3>
                <p>${message}</p>
            </div>
        `;
    },

    // ==========================================================================
    // Activity Log
    // ==========================================================================

    renderActivityLog(activities, filters = {}, totalCounts = null) {
        const activePreset = filters.preset || 'all';
        const dateFrom = filters.dateFrom || '';
        const dateTo = filters.dateTo || '';

        // Use server-side counts if provided (bypasses 1000-row limit), else fall back to array count
        let stats;
        if (totalCounts) {
            stats = totalCounts;
        } else {
            stats = { call: 0, email: 0, meeting: 0, linkedin: 0 };
            (activities || []).forEach(a => {
                const type = a.activity_type || 'note';
                if (stats[type] !== undefined) stats[type]++;
            });
        }

        // Group by date
        const grouped = {};
        (activities || []).forEach(a => {
            const date = new Date(a.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
            if (!grouped[date]) grouped[date] = [];
            grouped[date].push(a);
        });

        const icons = {
            'call': '📞', 'email': '✉️', 'meeting': '🤝',
            'linkedin': '🔗', 'note': '📝', 'status_change': '🔄',
            'outreach': '📤', 'stage': '➡️'
        };

        const outcomeLabels = {
            'no_answer': 'No Answer', 'left_voicemail': 'Left Voicemail',
            'connected': 'Connected', 'scheduled_meeting': 'Scheduled Meeting',
            'not_interested': 'Not Interested', 'sent': 'Sent',
            'replied': 'Replied', 'bounced': 'Bounced',
            'completed': 'Completed', 'no_show': 'No Show',
            'rescheduled': 'Rescheduled', 'other': 'Other'
        };

        const activityRows = Object.entries(grouped).map(([date, items]) => `
            <div class="activity-log-date-group">
                <div class="activity-log-date-header">${date}</div>
                ${items.map(a => {
            const time = new Date(a.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const icon = icons[a.activity_type] || '📝';
            const typeLabel = (a.activity_type || 'note').charAt(0).toUpperCase() + (a.activity_type || 'note').slice(1).replace('_', ' ');
            const outcomeLabel = a.outcome ? outcomeLabels[a.outcome] || a.outcome : '';
            return `
                        <div class="activity-log-item">
                            <div class="activity-log-icon">${icon}</div>
                            <div class="activity-log-content">
                                <div class="activity-log-header">
                                    <span class="activity-log-type">${typeLabel}${outcomeLabel ? ` — ${outcomeLabel}` : ''}</span>
                                    <span class="activity-log-time">${time}</span>
                                </div>
                                <a href="#/contact/${a.contact_id}" class="activity-log-contact">${a.contact_name}${a.contact_company ? ` · ${a.contact_company}` : ''}</a>
                                ${a.notes ? `<div class="activity-log-notes">${a.notes}</div>` : ''}
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `).join('');

        return `
            <div class="page-header">
                <h1 class="page-title">📋 Activity Log</h1>
                <p class="page-subtitle">Everything you've done, filterable by date</p>
            </div>

            <div class="activity-log-filters">
                <div class="activity-log-presets">
                    <button class="activity-preset-btn ${activePreset === 'today' ? 'active' : ''}" onclick="window.crmApp.filterActivities('today')">Today</button>
                    <button class="activity-preset-btn ${activePreset === 'week' ? 'active' : ''}" onclick="window.crmApp.filterActivities('week')">This Week</button>
                    <button class="activity-preset-btn ${activePreset === 'month' ? 'active' : ''}" onclick="window.crmApp.filterActivities('month')">This Month</button>
                    <button class="activity-preset-btn ${activePreset === 'all' ? 'active' : ''}" onclick="window.crmApp.filterActivities('all')">All Time</button>
                </div>
                <div class="activity-log-custom">
                    <input type="date" id="activityDateFrom" value="${dateFrom}" onchange="window.crmApp.filterActivitiesCustom()">
                    <span style="color: var(--color-text-muted);">to</span>
                    <input type="date" id="activityDateTo" value="${dateTo}" onchange="window.crmApp.filterActivitiesCustom()">
                </div>
            </div>

            <div class="stats-grid" style="margin-bottom: 16px;">
                <div class="stat-card">
                    <div class="stat-number">${stats.call}</div>
                    <div class="stat-label">Calls</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.linkedin}</div>
                    <div class="stat-label">LinkedIn</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.email}</div>
                    <div class="stat-label">Emails</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.meeting}</div>
                    <div class="stat-label">Meetings</div>
                </div>
            </div>

            <div class="card">
                ${activities.length === 0 ? `
                    <div class="empty-state">
                        <div class="empty-state-icon">📋</div>
                        <h3 class="empty-state-title">No activities found</h3>
                        <p>Try a different date range.</p>
                    </div>
                ` : `
                    ${activities.length >= 100 && activePreset === 'all' ? `
                        <div style="padding: 10px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">
                            Showing most recent 100 of ${(stats.call||0)+(stats.email||0)+(stats.linkedin||0)+(stats.meeting||0)} activities. Use date filters to see specific periods.
                        </div>
                    ` : ''}
                    ${activityRows}
                `}
            </div>
        `;
    }
};

// Make globally available
window.CRMComponents = CRMComponents;
