class DataTableViewer {
	constructor(config) {
		this.config = {
			dataUrl: config.dataUrl,
			dataJson: config.dataJson,
			editEndpoint: config.editEndpoint || '',
			deleteEndpoint: config.deleteEndpoint || '',
			extraEditData: config.extraEditData || {},
			extraDeleteData: config.extraDeleteData || {},
			onEditSuccess: config.onEditSuccess || ((response) => console.log('Edit success:', response)),
			onDeleteSuccess: config.onDeleteSuccess || ((response) => console.log('Delete success:', response)),
			allowDelete: config.allowDelete || false,
			columns: config.columns || [],
			rowsPerPage: config.rowsPerPage || 10,
			container: config.container || document.getElementById('tableContainer'),
			customEditForm: config.customEditForm || null
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
			} else if(this.config.dataJson){
				this.data = this.config.dataJson;
			} else {
				// Check for existing table rows
				const existingTable = this.config.container.querySelector('table');
				if (existingTable) {
					// Get headers first to map column fields
					const headers = Array.from(existingTable.querySelectorAll('thead th'))
						.map(th => th.textContent.trim());

					// If no columns were provided in config, create them from headers
					if (!this.config.columns.length) {
						this.config.columns = headers.map(header => ({
							field: header.toLowerCase().replace(/\s+/g, '_'),
							title: header
						}));
					}

					// Parse existing rows into data array
					this.data = Array.from(existingTable.querySelectorAll('tbody tr')).map(row => {
						const rowData = {};
						row.querySelectorAll('td').forEach((cell, index) => {
							const field = this.config.columns[index]?.field;
							if (field) {
								rowData[field] = cell.textContent.trim();
							}
						});
						return rowData;
					});
				} else {
					// No URL and no existing table, use empty array
					this.data = [];
				}
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

	async handleEdit(rowIndex, newRowData) {
		try {
			const response = await fetch(this.config.editEndpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					...newRowData,
					...this.config.extraEditData
				})
			});

			if (!response.ok) throw new Error('Edit failed');

			const result = await response.json();
			this.config.onEditSuccess(result);

			// Update local data
			Object.assign(this.data[rowIndex], newRowData);
			this.filterData();
			this.render();

		} catch (error) {
			console.error('Error saving edit:', error);
			alert('Failed to save changes');
		}
	}

	async handleDelete(rowIndex, row) {
		//let confirm =
		if (!await showConfirm('Confirm','Are you sure you want to delete this row?')) return;

		try {
			const response = await fetch(this.config.deleteEndpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					...row,
					...this.config.extraDeleteData
				})
			});

			if (!response.ok) throw new Error('Delete failed');

			const result = await response.json();
			this.config.onDeleteSuccess(result);

			// Remove from local data
			this.data.splice(rowIndex, 1);
			this.filterData();
			this.render();

		} catch (error) {
			console.error('Error deleting row:', error);
			alert('Failed to delete row');
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
								<button class="my-1 xp-2 edit-btn" data-row="${idx}" data-tooltip="Edit Row"><i class="bi bi-check-lg"></i></button>
								${this.config.allowDelete ? `<button class="my-1 xp-2 contrast delete-btn" data-tooltip="Delete Row" data-row="${idx}"><i class="bi bi-x-lg"></i></button>` : ''}
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
									col.searchType ===  'text' ?
				`<input type="text" class="column-search" data-column="${col.field}"
													value="${this.columnSearchValues[col.field] || ''}"
													placeholder="Search ${col.title}...">`
												: ''
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

				if (this.config.customEditForm) {
					// Call the custom edit form function with the row data and a callback
					this.config.customEditForm(row, (updatedRowData) => {
						this.handleEdit(rowIndex, updatedRowData);
					});
				} else {
					// Original inline editing logic
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
				}
			});
		});

		if (this.config.allowDelete) {
			this.config.container.querySelectorAll('.delete-btn').forEach(btn => {
				btn.addEventListener('click', () => {
					const rowIndex = parseInt(btn.dataset.row);
					const row = pageData[rowIndex];
					this.handleDelete(rowIndex, row);
				});
			});
		}
	}
}
