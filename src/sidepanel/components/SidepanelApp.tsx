import { useState, useEffect } from 'react'
import { Search, RefreshCw, Settings, ExternalLink, MoreVertical, List, Layers } from 'lucide-react'
import { Button, Loading } from '@shared/components'
import { useApp } from '@shared/contexts/AppContext'
import { useTabs } from '@shared/hooks/useTabs'
import TabsList from './TabsList'

interface GroupCardProps {
  group: {
    id: string
    name: string
    tabs: chrome.tabs.Tab[]
    category: string
    createdAt: Date
  }
  onViewGroup: (group: any) => void
}

function GroupCard({ group, onViewGroup }: GroupCardProps) {
  return (
    <div className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-medium text-gray-900 truncate">{group.name}</h3>
        <Button variant="ghost" size="sm" onClick={() => onViewGroup(group)}>
          <MoreVertical className="w-4 h-4" />
        </Button>
      </div>
      
      <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
        <span className="bg-gray-100 px-2 py-1 rounded text-xs">{group.category}</span>
        <span>{group.tabs.length} tabs</span>
      </div>
      
      <div className="space-y-1">
        {group.tabs.slice(0, 3).map((tab, index) => (
          <div key={index} className="flex items-center space-x-2 text-xs">
            <img 
              src={tab.favIconUrl || '/icon-16.png'} 
              alt="" 
              className="w-4 h-4"
              onError={(e) => { e.currentTarget.src = '/icon-16.png' }}
            />
            <span className="truncate">{tab.title}</span>
          </div>
        ))}
        {group.tabs.length > 3 && (
          <div className="text-xs text-gray-400">+{group.tabs.length - 3} more</div>
        )}
      </div>
    </div>
  )
}

export default function SidepanelApp() {
  const { state, dispatch } = useApp()
  const { tabs, switchToTab, closeTab, groupTabs } = useTabs()
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'recent' | 'favorites'>('all')
  const [selectedGroup, setSelectedGroup] = useState<any>(null)
  const [currentView, setCurrentView] = useState<'groups' | 'tabs'>('groups')
  const [isRefreshing, setIsRefreshing] = useState(false)

  // 加载最新的 Groups 数据
  const loadGroups = async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true })
      
      // 通过 background script 获取集成的 groups（包括原生和自定义groups）
      const response = await chrome.runtime.sendMessage({ type: 'GET_GROUPS' })
      
      if (response?.groups) {
        // 转换集成的 groups 为 AppContext 期望的格式
        const formattedGroups = response.groups.map((group: any) => ({
          id: group.id,
          name: group.name,
          tabs: group.tabs,
          category: group.category,
          createdAt: new Date(group.createdAt || Date.now()),
          lastUpdated: new Date(group.updatedAt || Date.now())
        }))
        
        dispatch({ type: 'SET_TAB_GROUPS', payload: formattedGroups })
      }
    } catch (error) {
      console.error('Failed to load groups:', error)
      dispatch({ type: 'SET_ERROR', payload: 'Failed to load tab groups' })
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }

  // 刷新数据
  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await loadGroups()
    } finally {
      setIsRefreshing(false)
    }
  }

  // 组件挂载时加载数据
  useEffect(() => {
    loadGroups()
  }, [])

  // 监听存储变化，自动更新数据
  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes['tabGroups']) {
        loadGroups()
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

  const handleViewGroup = (group: any) => {
    setSelectedGroup(group)
  }

  const handleOpenAllTabs = async (group: any) => {
    try {
      for (const tab of group.tabs) {
        if (tab.url) {
          await chrome.tabs.create({ url: tab.url, active: false })
        }
      }
    } catch (error) {
      console.error('Failed to open tabs:', error)
    }
  }

  const handleAnalyzeCurrentTab = async () => {
    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true })
      
      if (!currentTab?.id) {
        throw new Error('No active tab found')
      }
      
      // 发送分析请求到 background script
      await chrome.runtime.sendMessage({ 
        type: 'ANALYZE_TAB', 
        payload: { tabId: currentTab.id } 
      })
      
      // 重新加载 groups 以获取可能的新分组
      await loadGroups()
    } catch (error) {
      console.error('Failed to analyze current tab:', error)
      dispatch({ type: 'SET_ERROR', payload: 'Failed to analyze current tab' })
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }

  const handleSwitchToTab = async (tabId: number) => {
    try {
      await switchToTab(tabId)
    } catch (error) {
      console.error('Failed to switch to tab:', error)
    }
  }

  const handleCloseTab = async (tabId: number) => {
    try {
      await closeTab(tabId)
    } catch (error) {
      console.error('Failed to close tab:', error)
    }
  }

  const handleCreateGroupFromTabs = async (tabIds: number[]) => {
    try {
      const groupName = `新分组 ${new Date().toLocaleTimeString()}`
      await groupTabs(tabIds, groupName)
      
      // 重新加载 groups 以显示新创建的分组
      await loadGroups()
      
      console.log('Created group with tabs:', tabIds)
    } catch (error) {
      console.error('Failed to create group:', error)
    }
  }

  const filteredGroups = state.tabGroups.filter(group => {
    if (searchQuery && !group.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }
    if (filter === 'recent') {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      return new Date(group.createdAt) > threeDaysAgo
    }
    return true
  })

  if (state.isLoading && state.tabGroups.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <Loading text="Loading knowledge panel..." />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xl">🐝</span>
            <h1 className="font-semibold">Knowledge Panel</h1>
          </div>
          <div className="flex space-x-1">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleRefresh}
              loading={isRefreshing}
              disabled={state.isLoading}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => chrome.runtime.openOptionsPage()}>
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search your knowledge base..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
          />
        </div>

        {/* View Toggle */}
        <div className="flex space-x-2">
          <button
            onClick={() => setCurrentView('groups')}
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentView === 'groups'
                ? 'bg-primary-100 text-primary-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>分组</span>
          </button>
          <button
            onClick={() => setCurrentView('tabs')}
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentView === 'tabs'
                ? 'bg-primary-100 text-primary-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <List className="w-4 h-4" />
            <span>所有标签页</span>
          </button>
        </div>

        {/* Filters (only show for groups view) */}
        {currentView === 'groups' && (
          <div className="flex space-x-2">
            {(['all', 'recent', 'favorites'] as const).map((filterType) => (
              <button
                key={filterType}
                onClick={() => setFilter(filterType)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filter === filterType
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {filterType.charAt(0).toUpperCase() + filterType.slice(1)}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Stats */}
      <div className="bg-white border-b p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xl font-bold text-primary-600">{state.tabGroups.length}</div>
            <div className="text-xs text-gray-500">Groups</div>
          </div>
          <div>
            <div className="text-xl font-bold text-primary-600">{tabs.length}</div>
            <div className="text-xs text-gray-500">Tabs</div>
          </div>
          <div>
            <div className="text-xl font-bold text-primary-600">
              {new Set(state.tabGroups.map(g => g.category)).size}
            </div>
            <div className="text-xs text-gray-500">Categories</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-4">
        {currentView === 'groups' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-gray-900">Tab Groups</h2>
              <Button
                size="sm"
                onClick={handleAnalyzeCurrentTab}
                loading={state.isLoading}
              >
                Analyze Current
              </Button>
            </div>

            {filteredGroups.length > 0 ? (
              <div className="space-y-3">
                {filteredGroups.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    onViewGroup={handleViewGroup}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-gray-400 mb-2">🔍</div>
                <div className="text-sm text-gray-500">
                  {searchQuery ? 'No groups match your search' : 'No tab groups yet'}
                </div>
                {!searchQuery && (
                  <div className="text-xs text-gray-400 mt-1">
                    Start by analyzing your current tab
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <TabsList
            tabs={tabs}
            onSwitchToTab={handleSwitchToTab}
            onCloseTab={handleCloseTab}
            onCreateGroup={handleCreateGroupFromTabs}
          />
        )}
      </main>

      {/* Group Detail Modal */}
      {selectedGroup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">{selectedGroup.name}</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedGroup(null)}
              >
                ×
              </Button>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="bg-gray-100 px-2 py-1 rounded">{selectedGroup.category}</span>
                <span className="text-gray-500">
                  {new Date(selectedGroup.createdAt).toLocaleDateString()}
                </span>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Tabs ({selectedGroup.tabs.length})</h4>
                <div className="space-y-2">
                  {selectedGroup.tabs.map((tab: chrome.tabs.Tab, index: number) => (
                    <div key={index} className="flex items-center space-x-2 p-2 bg-gray-50 rounded">
                      <img 
                        src={tab.favIconUrl || '/icon-16.png'} 
                        alt="" 
                        className="w-4 h-4"
                        onError={(e) => { e.currentTarget.src = '/icon-16.png' }}
                      />
                      <span className="text-sm truncate flex-1">{tab.title}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => tab.url && chrome.tabs.create({ url: tab.url })}
                      >
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t flex space-x-2">
              <Button
                onClick={() => handleOpenAllTabs(selectedGroup)}
                className="flex-1"
              >
                Open All Tabs
              </Button>
              <Button
                variant="outline"
                onClick={() => setSelectedGroup(null)}
                className="flex-1"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {state.error && (
        <div className="bg-red-50 border-t border-red-200 p-3">
          <div className="text-sm text-red-800">{state.error}</div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: 'SET_ERROR', payload: null })}
            className="mt-1 text-red-600"
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  )
}