import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

require('dotenv').config();

export class AwsCdkEcsExampleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const subDomain = 'api-example';
    const apiDomain = `${subDomain}.${process.env.DOMAIN_NAME}`;

    const vpc = new ec2.Vpc(this, 'Vpc', { maxAzs: 3 });

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
    });

    const repository = ecr.Repository.fromRepositoryName(
      this,
      'EcrRepository',
      process.env.ECR_REPOSITORY_NAME!
    );

    const zone = route53.HostedZone.fromLookup(this, 'Zone', {
      domainName: process.env.DOMAIN_NAME!,
    });

    const certificate = new acm.DnsValidatedCertificate(
      this,
      'DomainCertificate',
      {
        domainName: apiDomain,
        hostedZone: zone,
        region: this.region,
      }
    );

    const service = new ecs_patterns.ApplicationLoadBalancedFargateService(
      this,
      'FargateService',
      {
        cluster,
        cpu: 256,
        desiredCount: 1,
        taskImageOptions: {
          image: ecs.ContainerImage.fromEcrRepository(repository, 'latest'),
          containerPort: 3000,
        },
        memoryLimitMiB: 1024,
        publicLoadBalancer: true,
        certificate,
      }
    );

    service.targetGroup.configureHealthCheck({
      path: '/alive',
    });

    const aRecord = new route53.ARecord(this, 'ARecord', {
      recordName: subDomain,
      zone,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.LoadBalancerTarget(service.loadBalancer)
      ),
      ttl: cdk.Duration.minutes(1),
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: `https://${apiDomain}`,
      description: 'The Url of api',
    });
  }
}
