'use client';

import { BarChartOutlined, TeamOutlined, LineChartOutlined, ApartmentOutlined } from '@ant-design/icons';
import { Button, Flex, Layout, Menu, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { useRouter } from 'next/navigation';

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
    key: '/people',
    icon: <TeamOutlined />,
    label: 'Pessoas'
  },
  {
    key: '/reports/jira',
    icon: <BarChartOutlined />,
    label: 'Relatório Jira'
  },
  {
    key: '/people/progress',
    icon: <LineChartOutlined />,
    label: 'Acompanhamento'
  },
  {
    key: '/squads',
    icon: <ApartmentOutlined />,
    label: 'Squads'
  }
];

export function AppShell({ title, subtitle, selectedPath, currentUserName, children }: AppShellProps) {
  const router = useRouter();

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
        theme="light"
        breakpoint="lg"
        collapsedWidth="0"
        style={{ borderRight: '1px solid #e5e7eb' }}
      >
        <Flex vertical style={{ height: '100%' }}>
          <div style={{ padding: 20, borderBottom: '1px solid #e5e7eb' }}>
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
