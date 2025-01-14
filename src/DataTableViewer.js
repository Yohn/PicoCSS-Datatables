class DataTableViewer {
	constructor(config) {
		this.config = {
			dataUrl: config.dataUrl,
			editEndpoint: config.editEndpoint || '',
			extraEditData: config.extraEditData || {},
			onEditSuccess: config.onEditSuccess || ((response) => console.log('Edit success:', response)),
			columns: config.columns || [],
			rowsPerPage: config.rowsPerPage || 10,
			container: config.container || document.getElementById('tableContainer')
		};

		this.data = [];
		this.filteredData = [];
		this.currentPage = 1;
		this.sortColumn = null;
		this.sortDirection = 'asc';
		this.columnSearchValues = {};
		this.globalSearchValue = '';
		this.hiddenColumns = new Set();

		this.init();
	}

	async init() {
		await this.loadData();
		this.setupControls();
		this.render();
	}

	async loadData() {
		this.config.container.innerHTML = '<div class="loading">Loading data...</div>';
		try {
			if (this.config.dataUrl) {
				const response = await fetch(this.config.dataUrl);
				this.data = await response.json();
			} else {
				// Use sample data for preview
				this.data = sampleData;
			}
			this.filteredData = [...this.data];
		} catch (error) {
			console.error('Error loading data:', error);
			this.config.container.innerHTML = '<div class="error">Error loading data</div>';
		}
	}

	setupControls() {
		// Global search
		document.getElementById('globalSearch').addEventListener('input', (e) => {
			this.globalSearchValue = e.target.value.toLowerCase();
			this.filterData();
			this.currentPage = 1;
			this.render();
		});

		// Rows per page
		document.getElementById('rowsPerPage').addEventListener('change', (e) => {
			this.config.rowsPerPage = parseInt(e.target.value);
			this.currentPage = 1;
			this.render();
		});

		// Column toggle menu
		const toggleBtn = document.getElementById('toggleColumnsBtn');
		const menu = document.getElementById('columnToggleMenu');

		toggleBtn.addEventListener('click', () => {
			menu.classList.toggle('hidden');
			menu.style.top = `${toggleBtn.offsetTop + toggleBtn.offsetHeight}px`;
			menu.style.left = `${toggleBtn.offsetLeft}px`;

			menu.innerHTML = this.config.columns.map(col => `
				<label>
					<input type="checkbox"
								 ${!this.hiddenColumns.has(col.field) ? 'checked' : ''}
								 data-column="${col.field}">
					${col.title}
				</label>
			`).join('');
		});

		menu.addEventListener('change', (e) => {
			if (e.target.matches('input[type="checkbox"]')) {
				const column = e.target.dataset.column;
				if (e.target.checked) {
					this.hiddenColumns.delete(column);
				} else {
					this.hiddenColumns.add(column);
				}
				this.render();
			}
		});

		// Close menu when clicking outside
		document.addEventListener('click', (e) => {
			if (!menu.contains(e.target) && e.target !== toggleBtn) {
				menu.classList.add('hidden');
			}
		});
	}
	filterData() {
		this.filteredData = this.data.filter(row => {
			// Global search
			if (this.globalSearchValue) {
				const rowString = Object.values(row).join(' ').toLowerCase();
				if (!rowString.includes(this.globalSearchValue)) return false;
			}

			// Column-specific search
			return Object.entries(this.columnSearchValues).every(([field, searchValue]) => {
				if (!searchValue) return true;
				const value = String(row[field]).toLowerCase();
				// For select type columns, do exact match
				const col = this.config.columns.find(c => c.field === field);
				if (col?.searchType === 'select') {
					return value === searchValue.toLowerCase();
				}
				// For text type columns, do contains match
				return value.includes(searchValue.toLowerCase());
			});
		});
	}

	sortData(column) {
		if (this.sortColumn === column) {
			this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			this.sortColumn = column;
			this.sortDirection = 'asc';
		}

		const col = this.config.columns.find(c => c.field === column);

		this.filteredData.sort((a, b) => {
			let valA = a[column];
			let valB = b[column];

			if (col.type === 'date') {
				valA = new Date(valA);
				valB = new Date(valB);
			}

			if (valA < valB) return this.sortDirection === 'desc' ? 1 : -1;
			if (valA > valB) return this.sortDirection === 'desc' ? -1 : 1;
			return 0;
		});

		this.render();
	}

	async handleEdit(rowIndex, row) {
		try {
			const response = await fetch(this.config.editEndpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					...row,
					...this.config.extraEditData
				})
			});

			if (!response.ok) throw new Error('Edit failed');

			const result = await response.json();
			this.config.onEditSuccess(result);

			// Update local data
			Object.assign(this.data[rowIndex], row);
			this.filterData();
			this.render();

		} catch (error) {
			console.error('Error saving edit:', error);
			alert('Failed to save changes');
		}
	}

	render() {
		const visibleColumns = this.config.columns.filter(col => !this.hiddenColumns.has(col.field));
		const startIndex = (this.currentPage - 1) * this.config.rowsPerPage;
		const endIndex = startIndex + this.config.rowsPerPage;
		const pageData = this.filteredData.slice(startIndex, endIndex);

		this.config.container.innerHTML = `
			<table class="striped">
				<thead>
					<tr>
						<th>Edit</th>
						${visibleColumns.map(col => `
							<th class="header-cell ${this.sortColumn === col.field ? `sort-${this.sortDirection}` : 'sort-indicator'}"
									data-column="${col.field}">
								${col.title}
							</th>
						`).join('')}
					</tr>
				</thead>
				<tbody>
					${pageData.map((row, idx) => `
						<tr id="row-${idx}">
							<td>
								<button class="edit-btn" data-row="${idx}">Edit</button>
							</td>
							${visibleColumns.map(col => `
								<td class="data-cell" data-column="${col.field}">${row[col.field]}</td>
							`).join('')}
						</tr>
					`).join('')}
				</tbody>
				<tfoot>
					<tr>
						<td></td>
						${visibleColumns.map(col => `
							<td>
								${col.searchType === 'select' ?
				`<select class="column-search" data-column="${col.field}">
										<option value="">All</option>
										${[...new Set(this.data.map(item => item[col.field]))].sort().map(value =>
					`<option value="${value}" ${this.columnSearchValues[col.field] === value ? 'selected' : ''}>${value}</option>`
				).join('')}
									</select>` :
				`<input type="text" class="column-search" data-column="${col.field}"
													value="${this.columnSearchValues[col.field] || ''}"
													placeholder="Search ${col.title}...">`
			}
							</td>
						`).join('')}
					</tr>
				</tfoot>
			</table>
			<nav>
				<ul></ul>
				<ul><li>
					<div class="pagination">
						<button ${this.currentPage === 1 ? 'disabled' : ''} onclick="dataTable.currentPage--; dataTable.render()">Previous</button>
						<span>Page ${this.currentPage} of ${Math.ceil(this.filteredData.length / this.config.rowsPerPage)}</span>
						<button ${this.currentPage === Math.ceil(this.filteredData.length / this.config.rowsPerPage) ? 'disabled' : ''}
								onclick="dataTable.currentPage++; dataTable.render()">Next</button>
					</div>
				</li></ul>
				<ul></ul>
		`;

		// Setup column search
		this.config.container.querySelectorAll('.column-search').forEach(input => {
			input.addEventListener('keyup', (e) => {  // Changed from 'input' to 'change'
				const column = e.target.dataset.column;
				const value = e.target.value;

				if (value === '') {
					delete this.columnSearchValues[column];
				} else {
					this.columnSearchValues[column] = value;
				}
				this.filterData();
				this.currentPage = 1;
				this.render();
				// Focus the input and move the cursor to the end
				const targetInput = document.querySelector(`tfoot input[data-column="${column}"]`);
				if (targetInput) {
					targetInput.focus();
					const length = targetInput.value.length;
					targetInput.setSelectionRange(length, length); // Set the cursor at the end
				}
			});
		});

		// Setup sorting
		this.config.container.querySelectorAll('.header-cell').forEach(header => {
			header.addEventListener('click', () => {
				const column = header.dataset.column;
				this.sortData(column);
			});
		});

		// Setup edit buttons
		this.config.container.querySelectorAll('.edit-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				const rowIndex = parseInt(btn.dataset.row);
				const row = pageData[rowIndex];

				const tr = document.getElementById(`row-${rowIndex}`);
				const originalContent = tr.innerHTML;

				tr.innerHTML = `
					<td>
						<button class="save-btn">Save</button>
						<button class="cancel-btn">Cancel</button>
					</td>
					${visibleColumns.map(col => `
						<td>
							<input type="text" value="${row[col.field]}" data-field="${col.field}">
						</td>
					`).join('')}
				`;

				tr.querySelector('.save-btn').addEventListener('click', () => {
					const updatedRow = { ...row };
					tr.querySelectorAll('input[data-field]').forEach(input => {
						updatedRow[input.dataset.field] = input.value;
					});
					this.handleEdit(rowIndex, updatedRow);
				});

				tr.querySelector('.cancel-btn').addEventListener('click', () => {
					tr.innerHTML = originalContent;
				});
			});
		});
	}
}