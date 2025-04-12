// Transaction table functionality
let transactionData = [];
let isTableVisible = false; // Track table visibility state

// Create and display the transaction table
function displayTransactionsTable(transactions, containerId = 'transaction-table-container') {
    // Store the transaction data globally
    transactionData = transactions;
    
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with ID ${containerId} not found`);
        return;
    }
    
    // Clear existing content
    container.innerHTML = '';
    
    // Create the table wrapper with controls
    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'transaction-table-wrapper';
    
    // Add table controls
    const tableControls = document.createElement('div');
    tableControls.className = 'table-controls';
    
    // Add search input
    const searchDiv = document.createElement('div');
    searchDiv.className = 'search-container';
    searchDiv.innerHTML = `
        <input type="text" id="transaction-search" placeholder="Search transactions...">
        <i class="fas fa-search"></i>
    `;
    
    // Add sort/filter options
    const filterDiv = document.createElement('div');
    filterDiv.className = 'filter-container';
    filterDiv.innerHTML = `
        <select id="sort-transactions">
            <option value="date-desc">Date (Newest First)</option>
            <option value="date-asc">Date (Oldest First)</option>
            <option value="amount-desc">Amount (Highest First)</option>
            <option value="amount-asc">Amount (Lowest First)</option>
        </select>
    `;
    
    tableControls.appendChild(searchDiv);
    tableControls.appendChild(filterDiv);
    tableWrapper.appendChild(tableControls);
    
    // Create table element
    const table = document.createElement('table');
    table.className = 'transaction-table';
    table.id = 'transaction-table';
    
    // Create table header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    // Determine columns based on first transaction
    const columns = transactions.length > 0 
        ? Object.keys(transactions[0]).filter(key => 
            ['date', 'description', 'debit', 'credit', 'balance'].includes(key))
        : ['date', 'description', 'debit', 'credit', 'balance'];
    
    // Add headers
    columns.forEach(column => {
        const th = document.createElement('th');
        // Capitalize first letter
        th.textContent = column.charAt(0).toUpperCase() + column.slice(1);
        headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Create table body
    const tbody = document.createElement('tbody');
    
    // Add data rows
    transactions.forEach(transaction => {
        const row = document.createElement('tr');
        
        columns.forEach(column => {
            const td = document.createElement('td');
            
            if (column === 'date') {
                // Format date for display
                let dateString = transaction[column];
                if (dateString && dateString.includes('T')) {
                    // Convert ISO date to readable format
                    const date = new Date(dateString);
                    dateString = date.toLocaleDateString();
                }
                td.textContent = dateString;
            } 
            else if (['debit', 'credit', 'balance'].includes(column)) {
                // Format currency values
                const value = transaction[column];
                if (value !== null && value !== undefined) {
                    td.textContent = formatCurrency(value);
                    
                    // Add class for positive/negative values
                    if (column === 'debit' && value > 0) {
                        td.className = 'negative-amount';
                    } else if (column === 'credit' && value > 0) {
                        td.className = 'positive-amount';
                    }
                } else {
                    td.textContent = '';
                }
            } 
            else {
                // Regular text content
                td.textContent = transaction[column] || '';
            }
            
            row.appendChild(td);
        });
        
        tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    tableWrapper.appendChild(table);
    
    // Add info about transaction count
    const tableInfo = document.createElement('div');
    tableInfo.className = 'table-info';
    tableInfo.innerHTML = `<span>Showing ${transactions.length} transactions</span>`;
    tableWrapper.appendChild(tableInfo);
    
    // Add the table to the container
    container.appendChild(tableWrapper);
    
    // Set up event listeners for search and sort
    setupTableInteractivity();
    
    // Maintain the previous state of visibility
    container.style.display = isTableVisible ? 'block' : 'none';
    
    // Update toggle button text
    updateToggleButtonText();
    
    return table;
}

// Helper to format currency values
function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    }).format(value);
}

// Add interactivity to the table
function setupTableInteractivity() {
    const searchInput = document.getElementById('transaction-search');
    const sortSelect = document.getElementById('sort-transactions');
    
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            filterTransactions();
        });
    }
    
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            filterTransactions();
        });
    }
}

// Filter and sort transactions based on user input
function filterTransactions() {
    const searchInput = document.getElementById('transaction-search');
    const sortSelect = document.getElementById('sort-transactions');
    
    if (!searchInput || !sortSelect || !transactionData.length) return;
    
    const searchTerm = searchInput.value.toLowerCase();
    const sortOption = sortSelect.value;
    
    // Filter data
    let filteredData = transactionData.filter(transaction => {
        // Search in description field
        return transaction.description.toLowerCase().includes(searchTerm);
    });
    
    // Sort data
    filteredData.sort((a, b) => {
        switch (sortOption) {
            case 'date-desc':
                return new Date(b.date) - new Date(a.date);
            case 'date-asc':
                return new Date(a.date) - new Date(b.date);
            case 'amount-desc':
                // Sort by the sum of debit and credit
                const amountA = Math.abs(a.debit) + a.credit;
                const amountB = Math.abs(b.debit) + b.credit;
                return amountB - amountA;
            case 'amount-asc':
                const amountC = Math.abs(a.debit) + a.credit;
                const amountD = Math.abs(b.debit) + b.credit;
                return amountC - amountD;
            default:
                return 0;
        }
    });
    
    // Update the table
    const tbody = document.querySelector('#transaction-table tbody');
    if (!tbody) return;
    
    // Clear existing rows
    tbody.innerHTML = '';
    
    // Get columns
    const columns = Array.from(document.querySelectorAll('#transaction-table th')).map(
        th => th.textContent.toLowerCase()
    );
    
    // Add filtered data rows
    filteredData.forEach(transaction => {
        const row = document.createElement('tr');
        
        columns.forEach(column => {
            const td = document.createElement('td');
            // Column name is capitalized in header but lowercase in data
            const colKey = column.toLowerCase();
            
            if (colKey === 'date') {
                // Format date for display
                let dateString = transaction[colKey];
                if (dateString && dateString.includes('T')) {
                    const date = new Date(dateString);
                    dateString = date.toLocaleDateString();
                }
                td.textContent = dateString;
            } 
            else if (['debit', 'credit', 'balance'].includes(colKey)) {
                // Format currency values
                const value = transaction[colKey];
                if (value !== null && value !== undefined) {
                    td.textContent = formatCurrency(value);
                    
                    // Add class for positive/negative values
                    if (colKey === 'debit' && value > 0) {
                        td.className = 'negative-amount';
                    } else if (colKey === 'credit' && value > 0) {
                        td.className = 'positive-amount';
                    }
                } else {
                    td.textContent = '';
                }
            } 
            else {
                // Regular text content
                td.textContent = transaction[colKey] || '';
            }
            
            row.appendChild(td);
        });
        
        tbody.appendChild(row);
    });
    
    // Update info about transaction count
    const tableInfo = document.querySelector('.table-info span');
    if (tableInfo) {
        tableInfo.textContent = `Showing ${filteredData.length} of ${transactionData.length} transactions`;
    }
}

// Update toggle button text based on current state
function updateToggleButtonText() {
    const toggleButton = document.getElementById('toggle-table-btn');
    if (toggleButton) {
        toggleButton.innerHTML = isTableVisible 
            ? '<i class="fas fa-chevron-up"></i> Hide Transactions'
            : '<i class="fas fa-chevron-down"></i> Show Transactions';
    }
}

// Toggle transaction table visibility
function toggleTransactionTable() {
    const tableContainer = document.getElementById('transaction-table-container');
    if (!tableContainer) return;
    
    isTableVisible = !isTableVisible;
    tableContainer.style.display = isTableVisible ? 'block' : 'none';
    
    // Update toggle button text
    updateToggleButtonText();
}

// Reset table state (called when switching sessions or going to initial view)
function resetTableState() {
    isTableVisible = false;
}