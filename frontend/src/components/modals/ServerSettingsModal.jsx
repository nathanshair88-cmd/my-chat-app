import React, { useState, useEffect } from 'react';
import { serverAPI, roleAPI, webhookAPI } from '../../services/api';
import { X, Settings, Users, Trash2, Shield, UserX, AlertTriangle, Check, Plus, Bot, Copy } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function ServerSettingsModal({ server, onClose, onServerUpdated, onServerDeleted }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  
  // Overview State
  const [name, setName] = useState(server.name || '');
  const [iconUrl, setIconUrl] = useState(server.icon_url || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Members State
  const [members, setMembers] = useState(server.members || []);
  const [error, setError] = useState(null);

  // Roles State
  const [roles, setRoles] = useState([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#99aab5');

  // Webhooks State
  const [webhooks, setWebhooks] = useState([]);
  const [newWebhookName, setNewWebhookName] = useState('');
  const [newWebhookChannelId, setNewWebhookChannelId] = useState('');
  const [copiedToken, setCopiedToken] = useState(null);

  const fetchRoles = async () => {
    try {
      const res = await roleAPI.getRoles(server.id);
      setRoles(res.data);
    } catch (err) {
      console.error("Failed to fetch roles:", err);
    }
  };

  const fetchWebhooks = async () => {
    try {
      const res = await webhookAPI.getWebhooks(server.id);
      setWebhooks(res.data);
    } catch (err) {
      console.error("Failed to fetch webhooks:", err);
    }
  };

  useEffect(() => {
    if (activeTab === 'roles' || activeTab === 'members') {
      fetchRoles();
    }
    if (activeTab === 'integrations') {
      fetchWebhooks();
    }
  }, [activeTab, server.id]);

  // Esc key to close
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSaveOverview = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const res = await serverAPI.updateServer(server.id, {
        name,
        icon_url: iconUrl || null
      });
      setSaveSuccess(true);
      if (onServerUpdated) onServerUpdated(res.data);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update server');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteServer = async () => {
    if (!window.confirm('Are you ABSOLUTELY sure you want to delete this server? This action cannot be undone.')) {
      return;
    }
    try {
      await serverAPI.deleteServer(server.id);
      if (onServerDeleted) onServerDeleted(server.id);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete server');
    }
  };

  const handleRemoveMember = async (memberUserId) => {
    if (!window.confirm('Are you sure you want to kick this member from the server?')) return;
    try {
      await serverAPI.removeMember(server.id, memberUserId);
      setMembers(prev => prev.filter(m => m.user_id !== memberUserId));
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to remove member');
    }
  };

  const handleCreateRole = async (e) => {
    e.preventDefault();
    try {
      await roleAPI.createRole(server.id, { name: newRoleName, color: newRoleColor });
      setNewRoleName('');
      setNewRoleColor('#99aab5');
      fetchRoles();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create role');
    }
  };

  const handleDeleteRole = async (roleId) => {
    if (!window.confirm('Delete this role?')) return;
    try {
      await roleAPI.deleteRole(server.id, roleId);
      fetchRoles();
      // Optimistically update members who had this role
      setMembers(prev => prev.map(m => m.custom_role_id === roleId ? { ...m, custom_role_id: null } : m));
    } catch {
      setError('Failed to delete role');
    }
  };

  const handleAssignRole = async (memberUserId, roleId) => {
    try {
      await roleAPI.assignRole(server.id, memberUserId, roleId || null);
      setMembers(prev => prev.map(m => m.user_id === memberUserId ? { ...m, custom_role_id: roleId || null } : m));
    } catch {
      setError('Failed to assign role');
    }
  };

  const handleUpdateMemberRole = async (memberUserId, role) => {
    try {
      await serverAPI.updateMemberRole(server.id, memberUserId, role);
      setMembers(prev => prev.map(m => m.user_id === memberUserId ? { ...m, role } : m));
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update member role');
    }
  };

  const handleCreateWebhook = async (e) => {
    e.preventDefault();
    if (!newWebhookChannelId) {
      setError('Please select a channel for the webhook');
      return;
    }
    try {
      await webhookAPI.createWebhook(server.id, {
        name: newWebhookName,
        channel_id: parseInt(newWebhookChannelId)
      });
      setNewWebhookName('');
      setNewWebhookChannelId('');
      fetchWebhooks();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create webhook');
    }
  };

  const handleDeleteWebhook = async (webhookId) => {
    if (!window.confirm('Delete this webhook? Apps using it will no longer be able to send messages.')) return;
    try {
      await webhookAPI.deleteWebhook(server.id, webhookId);
      fetchWebhooks();
    } catch {
      setError('Failed to delete webhook');
    }
  };

  const copyWebhookUrl = (token) => {
    const url = `${window.location.origin}/api/webhooks/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const currentMember = members.find(m => m.user_id === user?.id);
  const isOwner = server.owner_id === user?.id;
  const canManageServer = isOwner || currentMember?.role === 'admin';

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />
      
      {/* Modal Container */}
      <div className="relative bg-surface-base w-full max-w-4xl h-[32rem] rounded-xl shadow-2xl flex overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Left Sidebar */}
        <div className="w-64 bg-surface-panel flex flex-col border-r border-surface-border p-4">
          <div className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2 px-2">
            {server.name} Settings
          </div>
          
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center space-x-3 px-3 py-2 rounded-md font-medium transition-colors mb-1 ${
              activeTab === 'overview' 
                ? 'bg-surface-active text-text-primary' 
                : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Overview</span>
          </button>
          
          <button
            onClick={() => setActiveTab('roles')}
            className={`flex items-center space-x-3 px-3 py-2 rounded-md font-medium transition-colors mb-1 ${
              activeTab === 'roles' 
                ? 'bg-surface-active text-text-primary' 
                : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Roles</span>
          </button>
          
          <button
            onClick={() => setActiveTab('members')}
            className={`flex items-center space-x-3 px-3 py-2 rounded-md font-medium transition-colors ${
              activeTab === 'members' 
                ? 'bg-surface-active text-text-primary' 
                : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Members</span>
          </button>

          <button
            onClick={() => setActiveTab('integrations')}
            className={`flex items-center space-x-3 px-3 py-2 rounded-md font-medium transition-colors mt-1 ${
              activeTab === 'integrations' 
                ? 'bg-surface-active text-text-primary' 
                : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>Integrations</span>
          </button>

          <div className="mt-auto pt-4 border-t border-surface-border">
            <button
              onClick={handleDeleteServer}
              disabled={!isOwner}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md font-medium transition-colors ${
                isOwner 
                  ? 'text-danger hover:bg-danger/10' 
                  : 'text-text-muted opacity-50 cursor-not-allowed'
              }`}
            >
              <span>Delete Server</span>
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 flex flex-col bg-surface-base relative">
          
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-full transition-colors z-10"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex-1 overflow-y-auto p-8 no-scrollbar">
            {error && (
              <div className="mb-6 p-3 bg-danger/10 border border-danger/50 text-danger text-sm rounded-md flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}

            {activeTab === 'overview' && (
              <div className="max-w-xl">
                <h2 className="text-2xl font-bold text-text-primary mb-6">Server Overview</h2>
                
                <form onSubmit={handleSaveOverview} className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                      Server Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      disabled={!canManageServer}
                      className="w-full bg-surface-active text-text-primary border border-surface-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                      Server Icon URL (Optional)
                    </label>
                    <input
                      type="url"
                      value={iconUrl}
                      onChange={(e) => setIconUrl(e.target.value)}
                      disabled={!canManageServer}
                      className="w-full bg-surface-active text-text-primary border border-surface-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent transition-all"
                      placeholder="https://example.com/icon.png"
                    />
                  </div>

                  {canManageServer && (
                    <div className="pt-4 flex items-center space-x-4">
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="px-6 py-2 bg-accent-primary hover:bg-accent-hover text-white rounded-md font-semibold transition-colors disabled:opacity-50"
                      >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                      </button>
                      {saveSuccess && (
                        <span className="text-success text-sm flex items-center space-x-1 animate-fadeIn">
                          <Check className="w-4 h-4" />
                          <span>Saved successfully!</span>
                        </span>
                      )}
                    </div>
                  )}
                </form>
              </div>
            )}

            {activeTab === 'roles' && (
              <div className="max-w-2xl">
                <h2 className="text-2xl font-bold text-text-primary mb-6">Server Roles</h2>
                
                {isOwner && (
                  <form onSubmit={handleCreateRole} className="mb-8 p-4 bg-surface-active rounded-md border border-surface-border">
                    <h3 className="text-sm font-bold text-text-primary mb-4">Create New Role</h3>
                    <div className="flex items-end space-x-4">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                          Role Name
                        </label>
                        <input
                          type="text"
                          value={newRoleName}
                          onChange={(e) => setNewRoleName(e.target.value)}
                          required
                          className="w-full bg-surface-panel text-text-primary border border-surface-border rounded-md px-3 py-2 focus:outline-none focus:border-accent-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                          Color
                        </label>
                        <input
                          type="color"
                          value={newRoleColor}
                          onChange={(e) => setNewRoleColor(e.target.value)}
                          className="w-12 h-10 bg-transparent border-0 rounded cursor-pointer"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={!newRoleName.trim()}
                        className="px-4 py-2 bg-accent-primary hover:bg-accent-hover text-white rounded-md font-semibold transition-colors flex items-center disabled:opacity-50"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Create
                      </button>
                    </div>
                  </form>
                )}

                <div className="space-y-2">
                  {roles.length === 0 ? (
                    <div className="text-text-muted text-sm italic">No custom roles created yet.</div>
                  ) : (
                    roles.map(role => (
                      <div key={role.id} className="flex items-center justify-between p-3 bg-surface-active border border-surface-border rounded-md">
                        <div className="flex items-center space-x-3">
                          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: role.color }} />
                          <span className="font-semibold text-text-primary" style={{ color: role.color }}>{role.name}</span>
                        </div>
                        {isOwner && (
                          <button
                            onClick={() => handleDeleteRole(role.id)}
                            className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded-md transition-colors"
                            title="Delete Role"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === 'members' && (
              <div className="max-w-2xl">
                <h2 className="text-2xl font-bold text-text-primary mb-2">Server Members</h2>
                <p className="text-text-muted text-sm mb-6">{members.length} member{members.length !== 1 ? 's' : ''}</p>
                
                <div className="space-y-2">
                  {members.map(member => {
                    const isMemberOwner = member.role === 'owner';
                    const memberRole = isMemberOwner ? 'owner' : member.role === 'admin' ? 'admin' : 'member';
                    const isMemberAdmin = memberRole === 'admin';
                    const canRemoveThisMember = isOwner
                      ? !isMemberOwner
                      : canManageServer && memberRole === 'member' && member.user_id !== user?.id;
                    const avatarUrl = member.user?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${member.user?.username || 'user'}`;
                    
                    return (
                      <div key={member.id} className="flex items-center justify-between p-3 bg-surface-active border border-surface-border rounded-md hover:border-accent-primary/50 transition-colors">
                        <div className="flex items-center space-x-3">
                          <img src={avatarUrl} alt={member.user?.username} className="w-10 h-10 rounded-full bg-surface-panel object-cover" />
                          <div>
                            <div className="font-bold text-text-primary flex items-center space-x-2">
                              <span>{member.user?.username}</span>
                              {isMemberOwner && <Shield className="w-3.5 h-3.5 text-amber-500" title="Server Owner" />}
                            </div>
                            <div className="text-xs text-text-muted font-mono">#{member.user?.public_id || member.user_id}</div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${
                            memberRole === 'owner'
                              ? 'border-amber-500/60 text-amber-400'
                              : isMemberAdmin
                                ? 'border-accent-primary/60 text-accent-primary'
                                : 'border-surface-border text-text-muted'
                          }`}>
                            {memberRole === 'owner' ? 'Owner' : isMemberAdmin ? 'Admin' : 'Member'}
                          </div>

                          {isOwner && !isMemberOwner && (
                            <select
                              value={memberRole}
                              onChange={(e) => handleUpdateMemberRole(member.user_id, e.target.value)}
                              className="bg-surface-panel border border-surface-border text-text-primary text-xs rounded px-2 py-1 focus:outline-none"
                            >
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                            </select>
                          )}

                          {/* Role Assignment Dropdown */}
                          {isOwner && !isMemberOwner && (
                            roles.length > 0 ? (
                              <select
                                value={member.custom_role_id || ''}
                                onChange={(e) => handleAssignRole(member.user_id, e.target.value ? parseInt(e.target.value) : null)}
                                className="bg-surface-panel border border-surface-border text-text-primary text-xs rounded px-2 py-1 focus:outline-none"
                              >
                                <option value="">No Role</option>
                                {roles.map(r => (
                                  <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                              </select>
                            ) : (
                              <div className="text-[10px] text-text-muted italic bg-surface-active px-2 py-1 rounded border border-surface-border">Create a role first</div>
                            )
                          )}
                          
                          {/* Display role badge for non-owners (or owners can see their own) */}
                          {!isOwner && member.custom_role_id && (
                            <div 
                              className="text-xs px-2 py-0.5 rounded-full border"
                              style={{ 
                                color: roles.find(r => r.id === member.custom_role_id)?.color,
                                borderColor: roles.find(r => r.id === member.custom_role_id)?.color 
                              }}
                            >
                              {roles.find(r => r.id === member.custom_role_id)?.name}
                            </div>
                          )}

                          {canRemoveThisMember && (
                            <button
                              onClick={() => handleRemoveMember(member.user_id)}
                              className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-md transition-colors"
                              title="Kick Member"
                            >
                              <UserX className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'integrations' && (
              <div className="max-w-2xl">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-text-primary mb-1">Webhooks & Integrations</h2>
                    <p className="text-sm text-text-muted">Create webhooks to allow automated scripts and bots to post messages in channels.</p>
                  </div>
                  <Bot className="w-10 h-10 text-text-muted/30" />
                </div>

                {canManageServer && (
                  <form onSubmit={handleCreateWebhook} className="mb-8 p-4 bg-surface-active rounded-md border border-surface-border">
                    <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center">
                      <Plus className="w-4 h-4 mr-2 text-accent-primary" />
                      Create New Webhook
                    </h3>
                    <div className="grid grid-cols-2 gap-4 items-end">
                      <div>
                        <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                          Bot Name
                        </label>
                        <input
                          type="text"
                          value={newWebhookName}
                          onChange={(e) => setNewWebhookName(e.target.value)}
                          placeholder="e.g. GitHub Bot"
                          required
                          className="w-full bg-surface-panel text-text-primary border border-surface-border rounded-md px-3 py-2 focus:outline-none focus:border-accent-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                          Channel
                        </label>
                        <select
                          value={newWebhookChannelId}
                          onChange={(e) => setNewWebhookChannelId(e.target.value)}
                          required
                          className="w-full bg-surface-panel text-text-primary border border-surface-border rounded-md px-3 py-2 focus:outline-none focus:border-accent-primary appearance-none"
                        >
                          <option value="" disabled>Select a channel</option>
                          {server.channels?.map(c => (
                            <option key={c.id} value={c.id}># {c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2 mt-2">
                        <button
                          type="submit"
                          disabled={!newWebhookName.trim() || !newWebhookChannelId}
                          className="w-full py-2 bg-accent-primary hover:bg-accent-hover text-white rounded-md font-semibold transition-colors flex items-center justify-center disabled:opacity-50"
                        >
                          Create Webhook
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                <div className="space-y-4">
                  {webhooks.length === 0 ? (
                    <div className="text-center py-8 bg-surface-active border border-surface-border rounded-md">
                      <Bot className="w-12 h-12 text-text-muted/30 mx-auto mb-3" />
                      <p className="text-text-muted text-sm">No webhooks have been created yet.</p>
                    </div>
                  ) : (
                    webhooks.map(webhook => {
                      const ch = server.channels?.find(c => c.id === webhook.channel_id);
                      const isCopied = copiedToken === webhook.token;
                      
                      return (
                        <div key={webhook.id} className="p-4 bg-surface-active border border-surface-border rounded-md flex flex-col space-y-4 hover:border-accent-primary/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                                <Bot className="w-6 h-6" />
                              </div>
                              <div>
                                <div className="font-bold text-text-primary">{webhook.name}</div>
                                <div className="text-xs text-text-muted flex items-center space-x-1">
                                  <span>Posts to</span>
                                  <span className="font-semibold text-text-primary">#{ch?.name || 'unknown-channel'}</span>
                                </div>
                              </div>
                            </div>
                            {canManageServer && (
                              <button
                                onClick={() => handleDeleteWebhook(webhook.id)}
                                className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-md transition-colors"
                                title="Delete Webhook"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          
                          <div className="bg-surface-panel border border-surface-border rounded p-2 flex items-center justify-between">
                            <div className="font-mono text-xs text-text-muted truncate mr-4">
                              {window.location.origin}/api/webhooks/{webhook.token}
                            </div>
                            <button
                              onClick={() => copyWebhookUrl(webhook.token)}
                              className={`shrink-0 px-3 py-1.5 rounded text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
                                isCopied 
                                  ? 'bg-success/20 text-success' 
                                  : 'bg-accent-primary hover:bg-accent-hover text-white'
                              }`}
                            >
                              {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{isCopied ? 'Copied' : 'Copy URL'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
