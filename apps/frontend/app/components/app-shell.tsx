'use client';

import { BarChartOutlined, LineChartOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Button, Flex, Layout, Menu, Switch, Typography, theme } from 'antd';
import type { MenuProps } from 'antd';
import { useRouter } from 'next/navigation';
import { useThemeMode } from '../providers';

const { Sider, Header, Content } = Layout;

type AppShellProps = {
  title: string;
  subtitle: string;
  selectedPath: string;
  currentUserName?: string;
  children: React.ReactNode;
};

const menuItems: MenuProps['items'] = [
  {
    key: '/reports/jira',
    icon: <BarChartOutlined />,
    label: 'Relatório Jira'
  },
  {
    key: '/people/progress',
    icon: <LineChartOutlined />,
    label: 'Acompanhamento'
  }
];

export function AppShell({ title, subtitle, selectedPath, currentUserName, children }: AppShellProps) {
  const router = useRouter();
  const { token } = theme.useToken();
  const { mode, setMode } = useThemeMode();

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (typeof key === 'string') {
      router.push(key);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('teamsight_token');
    localStorage.removeItem('teamsight_user_name');
    router.replace('/login');
  };

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <Sider
        width={240}
        theme={mode === 'dark' ? 'dark' : 'light'}
        breakpoint="lg"
        collapsedWidth="0"
        style={{ borderRight: `1px solid ${token.colorBorder}` }}
      >
        <Flex vertical style={{ height: '100%' }}>
          <div style={{ padding: 20, borderBottom: `1px solid ${token.colorBorder}` }}>
            <Typography.Title level={3} style={{ margin: 0 }}>
              TeamSight
            </Typography.Title>
            <Typography.Text type="secondary">Navegação</Typography.Text>
          </div>

          <Menu
            mode="inline"
            selectedKeys={[selectedPath]}
            items={menuItems}
            onClick={handleMenuClick}
            style={{ border: 'none', flex: 1, paddingTop: 12 }}
          />
        </Flex>
      </Sider>

      <Layout style={{ background: 'transparent' }}>
        <Header style={{ background: 'transparent', height: 'auto', lineHeight: 1, padding: 24 }}>
          <Flex align="center" justify="space-between" gap={12} wrap>
            <div>
              <Typography.Title level={2} style={{ margin: 0 }}>
                {title}
              </Typography.Title>
              <Typography.Text type="secondary">{subtitle}</Typography.Text>
            </div>

            <Flex align="center" gap={12}>
              <Flex align="center" gap={8}>
                <SunOutlined style={{ color: mode === 'dark' ? token.colorTextSecondary : token.colorPrimary }} />
                <Switch
                  size="small"
                  checked={mode === 'dark'}
                  onChange={(checked) => setMode(checked ? 'dark' : 'light')}
                />
                <MoonOutlined style={{ color: mode === 'dark' ? token.colorPrimary : token.colorTextSecondary }} />
              </Flex>
              {currentUserName ? <Typography.Text type="secondary">{currentUserName}</Typography.Text> : null}
              <Button onClick={handleLogout}>Sair</Button>
            </Flex>
          </Flex>
        </Header>

        <Content style={{ padding: '0 24px 24px' }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
